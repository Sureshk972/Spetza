import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { safeTrackEvent } from "../_shared/analytics.ts";

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
    .select("id, courier_id, status, stripe_payment_intent_id")
    .eq("id", delivery_request_id)
    .single();
  if (requestErr || !request) return json({ error: "request not found" }, 404);
  if (request.courier_id !== user.id) return json({ error: "not your delivery" }, 403);
  if (request.status !== "accepted" && request.status !== "picked_up") {
    return json({ error: `cannot complete from status ${request.status}` }, 409);
  }
  if (!request.stripe_payment_intent_id) {
    return json({ error: "no payment intent on record" }, 409);
  }

  let pi;
  try {
    pi = await stripe.paymentIntents.capture(
      request.stripe_payment_intent_id,
      {},
      { idempotencyKey: `capture:${delivery_request_id}` }
    );
  } catch (e) {
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

  await safeTrackEvent(supabase, user.id, "delivery_completed", {
    delivery_request_id,
  });
  await safeTrackEvent(supabase, user.id, "payment_captured", {
    delivery_request_id,
    amount_cents: pi.amount,
    status: "succeeded",
  });

  return json({ delivery_request_id, payment_intent_id: pi.id });
});
