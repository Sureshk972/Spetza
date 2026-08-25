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

  const { delivery_request_id, delivery_photo_path, outcome, return_pin } =
    await req.json().catch(() => ({}));
  if (!delivery_request_id) return json({ error: "missing delivery_request_id" }, 400);

  // 'delivered' is the default so existing callers keep working. 'returned'
  // means nobody was at the dropoff and the sender asked for the package
  // back -- the courier is paid the same either way, so the two outcomes
  // share this entire capture path and differ only in their proof and their
  // terminal status.
  const isReturn = outcome === "returned";
  if (outcome && outcome !== "delivered" && outcome !== "returned") {
    return json({ error: `unknown outcome: ${outcome}` }, 400);
  }

  const { data: request, error: requestErr } = await supabase
    .from("delivery_requests")
    .select(
      "id, courier_id, sender_id, order_number, status, stripe_payment_intent_id, " +
        "platform_fee_cents, delivery_photo_path, delivery_photo_required, no_answer_policy",
    )
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

  // Proof of delivery. Enforced here rather than in the client because this
  // photo is the whole basis for treating a completed delivery as settled --
  // a client-side-only check would be one devtools call away from useless.
  const proofPath: string | null =
    delivery_photo_path ?? request.delivery_photo_path ?? null;

  // A delivery is proved by the photo of the drop. A return is proved by the
  // sender's handback code -- a photo would only show a package on a porch,
  // which is exactly the thing a dishonest return would fake.
  if (!isReturn && request.delivery_photo_required && !proofPath) {
    return json({ error: "delivery photo required", code: "photo_required" }, 409);
  }

  if (isReturn) {
    if (request.no_answer_policy !== "return_to_sender") {
      return json(
        { error: "this delivery is not set to return to sender", code: "policy_mismatch" },
        409,
      );
    }
    const gate = await checkReturnPin(supabase, delivery_request_id, return_pin);
    if (!gate.ok) return json({ error: gate.error, code: gate.code }, gate.status);
  }

  // A courier may only attach a photo filed under this delivery's own id.
  // Without this check the path is caller-controlled and could point at
  // another delivery's proof.
  if (proofPath && !proofPath.startsWith(`${delivery_request_id}/`)) {
    return json({ error: "photo does not belong to this delivery" }, 400);
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
      status: isReturn ? "returned" : "delivered",
      ...(isReturn
        ? { returned_at: new Date().toISOString() }
        : { delivered_at: new Date().toISOString() }),
      ...(proofPath ? { delivery_photo_path: proofPath } : {}),
    })
    .eq("id", delivery_request_id)
    .eq("courier_id", user.id);

  if (updateErr) {
    // PI already captured; surface a clear error but funds are collected.
    return json({ error: "payment captured but request update failed", detail: updateErr.message }, 500);
  }

  // Push: payment captured notification to sender
  await sendPushToUsers(supabase, [request.sender_id], {
    title: isReturn
      ? `${request.order_number} — Returned to you`
      : `${request.order_number} — Payment processed`,
    body: `$${(pi.amount / 100).toFixed(2)} has been charged for your delivery.`,
    data: {
      event: "payment_captured",
      delivery_request_id,
      deep_link: `/sender/requests/${delivery_request_id}`,
    },
  });

  await safeTrackEvent(supabase, user.id, isReturn ? "delivery_returned" : "delivery_completed", {
    delivery_request_id,
    earnback_credit_cents: earnbackApplied,
  });
  await safeTrackEvent(supabase, user.id, "payment_captured", {
    delivery_request_id,
    amount_cents: pi.amount,
    status: "succeeded",
  });

  return json({
    delivery_request_id,
    payment_intent_id: pi.id,
    outcome: isReturn ? "returned" : "delivered",
  });
});

// Handback-code check for returns. Mirrors verify-pickup-pin's brute-force
// rules -- five tries, then a fifteen-minute lockout -- because this code
// stands between a courier and a full fee for a package they still hold.
const MAX_RETURN_ATTEMPTS = 5;
const RETURN_LOCKOUT_MINUTES = 15;

async function checkReturnPin(
  supabase: any,
  deliveryRequestId: string,
  submitted: unknown,
): Promise<{ ok: true } | { ok: false; error: string; code: string; status: number }> {
  if (typeof submitted !== "string" || !/^\d{4}$/.test(submitted)) {
    return { ok: false, error: "return code required", code: "return_pin_required", status: 400 };
  }

  const { data: row } = await supabase
    .from("delivery_pins")
    .select("return_pin, return_attempts, return_locked_until")
    .eq("delivery_request_id", deliveryRequestId)
    .maybeSingle();

  if (!row?.return_pin) {
    return { ok: false, error: "no return code on record", code: "no_return_pin", status: 409 };
  }

  if (row.return_locked_until && new Date(row.return_locked_until) > new Date()) {
    return { ok: false, error: "too many attempts", code: "return_locked", status: 429 };
  }

  if (row.return_pin !== submitted) {
    const attempts = (row.return_attempts ?? 0) + 1;
    const lock = attempts >= MAX_RETURN_ATTEMPTS
      ? new Date(Date.now() + RETURN_LOCKOUT_MINUTES * 60_000).toISOString()
      : null;
    await supabase
      .from("delivery_pins")
      .update({
        return_attempts: lock ? 0 : attempts,
        return_locked_until: lock,
      })
      .eq("delivery_request_id", deliveryRequestId);
    return {
      ok: false,
      error: lock ? "too many attempts" : "code doesn't match",
      code: lock ? "return_locked" : "return_pin_mismatch",
      status: lock ? 429 : 403,
    };
  }

  await supabase
    .from("delivery_pins")
    .update({ return_attempts: 0, return_locked_until: null })
    .eq("delivery_request_id", deliveryRequestId);
  return { ok: true };
}
