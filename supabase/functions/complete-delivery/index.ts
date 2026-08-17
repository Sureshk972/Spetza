import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { safeTrackEvent } from "../_shared/analytics.ts";
import { sendPushToUsers } from "../_shared/fcm.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "missing auth" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const token = auth.replace("Bearer ", "");
  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return json({ error: "unauthenticated" }, 401);

  const { delivery_request_id } = await req.json().catch(() => ({}));
  if (!delivery_request_id) return json({ error: "missing delivery_request_id" }, 400);

  const { data: request, error: requestErr } = await supabase
    .from("delivery_requests")
    .select("id, courier_id, sender_id, order_number, status, stripe_payment_intent_id, platform_fee_cents")
    .eq("id", delivery_request_id)
    .single();
  if (requestErr || !request) return json({ error: "request not found" }, 404);
  if (request.courier_id !== user.id) return json({ error: "not your delivery" }, 403);
  if (request.status !== "picked_up") {
    return json({ error: `cannot complete from status ${request.status} — pickup must be verified first` }, 409);
  }
  if (!request.stripe_payment_intent_id) {
    return json({ error: "no payment intent on record" }, 409);
  }

  // Apply earnback credit BEFORE capture. Before this fix, we recorded
  // the credit but never reduced Stripe's application_fee, so the money
  // never actually reached the courier's Connect account. Now the
  // sequence is credit → capture (with reduced fee) → update. If capture
  // fails, we reverse the credit so the courier's balance stays honest.
  let earnbackApplied = 0;
  try {
    const { data: credit } = await supabase.rpc("apply_earnback_credit", {
      p_courier_id: user.id,
      p_delivery_id: delivery_request_id,
    });
    earnbackApplied = credit ?? 0;
  } catch {
    // Non-fatal — capture at the full fee if the RPC errors.
  }

  // Original application_fee_amount at accept was (platform_fee_cents * 2)
  // per accept-delivery-request. The apply_earnback_credit RPC just
  // decremented platform_fee_cents by earnbackApplied, so reconstruct
  // the original by adding it back. Reduce by the credit for capture.
  const originalFeeCents = (request.platform_fee_cents ?? 0) * 2 + earnbackApplied;
  const reducedFeeCents = Math.max(0, originalFeeCents - earnbackApplied);

  let pi;
  try {
    pi = await stripe.paymentIntents.capture(
      request.stripe_payment_intent_id,
      { application_fee_amount: reducedFeeCents },
      // Key includes earnbackApplied so a retry after we adjusted the
      // credit doesn't hit a stale idempotent response with the wrong fee.
      { idempotencyKey: `capture:${delivery_request_id}:${earnbackApplied}` }
    );
  } catch (e) {
    // Capture failed — reverse the credit so the courier isn't shown
    // progress toward the $40 payback that didn't happen.
    if (earnbackApplied > 0) {
      try {
        await supabase.rpc("reverse_earnback_credit", {
          p_courier_id: user.id,
          p_delivery_id: delivery_request_id,
          p_credit_cents: earnbackApplied,
        });
      } catch (revErr) {
        console.error("complete-delivery: failed to reverse earnback after capture failure", revErr);
      }
    }
    return json({ error: e?.message || "stripe capture failed" }, 402);
  }

  if (pi.status !== "succeeded") {
    return json({ error: `capture returned status ${pi.status}` }, 402);
  }

  const { error: updateErr } = await supabase
    .from("delivery_requests")
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
    })
    .eq("id", delivery_request_id)
    .eq("courier_id", user.id);

  if (updateErr) {
    // PI already captured; surface a clear error but funds are collected.
    return json({ error: "payment captured but request update failed", detail: updateErr.message }, 500);
  }

  // Push: payment captured notification to sender
  await sendPushToUsers(supabase, [request.sender_id], {
    title: `${request.order_number} — Payment processed`,
    body: `$${(pi.amount / 100).toFixed(2)} has been charged for your delivery.`,
    data: {
      event: "payment_captured",
      delivery_request_id,
      deep_link: `/sender/requests/${delivery_request_id}`,
    },
  });

  await safeTrackEvent(supabase, user.id, "delivery_completed", {
    delivery_request_id,
    earnback_credit_cents: earnbackApplied,
  });
  await safeTrackEvent(supabase, user.id, "payment_captured", {
    delivery_request_id,
    amount_cents: pi.amount,
    status: "succeeded",
  });

  return json({ delivery_request_id, payment_intent_id: pi.id });
});
