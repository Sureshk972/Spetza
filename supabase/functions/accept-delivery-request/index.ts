import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { safeTrackEvent } from "../_shared/analytics.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const PLATFORM_FEE_BPS = parseInt(Deno.env.get("PLATFORM_FEE_BPS") ?? "1500");

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

  // Courier (caller) must be a verified courier with Connect ready.
  const { data: courier } = await supabase
    .from("profiles")
    .select("account_type, verification_status, stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled")
    .eq("id", user.id)
    .single();
  if (courier?.account_type !== "courier") return json({ error: "only couriers can accept" }, 403);
  if (courier.verification_status !== "approved") {
    return json({ error: "courier not approved" }, 403);
  }
  if (
    !courier.stripe_connect_account_id ||
    !courier.stripe_connect_charges_enabled ||
    !courier.stripe_connect_payouts_enabled
  ) {
    return json({ error: "courier payouts not set up" }, 409);
  }

  const { data: request, error: requestErr } = await supabase
    .from("delivery_requests")
    .select("id, sender_id, courier_id, status, max_price_cents")
    .eq("id", delivery_request_id)
    .single();
  if (requestErr || !request) return json({ error: "request not found" }, 404);
  if (request.status !== "open" || request.courier_id) {
    return json({ error: "request not available" }, 409);
  }
  if (request.sender_id === user.id) {
    return json({ error: "cannot accept your own request" }, 409);
  }

  const { data: sender } = await supabase
    .from("profiles")
    .select("stripe_customer_id, stripe_default_payment_method_id")
    .eq("id", request.sender_id)
    .single();
  if (!sender?.stripe_customer_id || !sender.stripe_default_payment_method_id) {
    return json({ error: "sender has no payment method on file" }, 409);
  }

  const fee = Math.round(request.max_price_cents * PLATFORM_FEE_BPS / 10000);

  let pi;
  try {
    pi = await stripe.paymentIntents.create(
      {
        amount: request.max_price_cents + fee,
        currency: "usd",
        customer: sender.stripe_customer_id,
        payment_method: sender.stripe_default_payment_method_id,
        capture_method: "manual",
        confirm: true,
        off_session: true,
        application_fee_amount: fee,
        transfer_data: { destination: courier.stripe_connect_account_id },
        on_behalf_of: courier.stripe_connect_account_id,
        metadata: {
          delivery_request_id,
          sender_id: request.sender_id,
          courier_id: user.id,
        },
      },
      { idempotencyKey: `accept:${delivery_request_id}:${user.id}` }
    );
  } catch (e) {
    return json({ error: e?.message || "stripe error" }, 402);
  }

  if (pi.status === "requires_action") {
    // off_session=true means we cannot do 3DS in line. Surface failure.
    await stripe.paymentIntents.cancel(pi.id).catch(() => {});
    return json({ error: "sender card requires authentication; ask them to re-add it" }, 402);
  }
  if (pi.status !== "requires_capture") {
    return json({ error: `payment auth failed: ${pi.status}` }, 402);
  }

  // Atomic claim: only update if still open and unclaimed.
  const { data: updated, error: claimErr } = await supabase
    .from("delivery_requests")
    .update({
      status: "accepted",
      courier_id: user.id,
      accepted_at: new Date().toISOString(),
      stripe_payment_intent_id: pi.id,
      platform_fee_cents: fee,
      accepted_price_cents: request.max_price_cents,
    })
    .eq("id", delivery_request_id)
    .eq("status", "open")
    .is("courier_id", null)
    .select()
    .single();

  if (claimErr || !updated) {
    // Lost the race or update failed — back out the PI.
    await stripe.paymentIntents.cancel(pi.id).catch(() => {});
    return json({ error: "request was claimed by someone else" }, 409);
  }

  await safeTrackEvent(supabase, user.id, "delivery_accepted", {
    delivery_request_id,
    accepted_price_cents: request.max_price_cents,
    platform_fee_cents: fee,
  });
  await safeTrackEvent(supabase, user.id, "payment_authorized", {
    delivery_request_id,
    amount_cents: pi.amount,
    status: pi.status,
  });

  return json({ delivery_request_id });
});
