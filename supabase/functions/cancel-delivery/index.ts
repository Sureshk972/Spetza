import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";

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
    .select("id, sender_id, courier_id, status, stripe_payment_intent_id")
    .eq("id", delivery_request_id)
    .single();
  if (requestErr || !request) return json({ error: "request not found" }, 404);

  const isSender = request.sender_id === user.id;
  const isCourier = request.courier_id === user.id;
  if (!isSender && !isCourier) return json({ error: "not your delivery" }, 403);

  // MVP scope: only allow cancel/abandon from 'accepted'. Once picked up, package
  // is in transit and needs a manual resolution path.
  if (request.status !== "accepted") {
    return json({ error: `cannot cancel from status ${request.status}` }, 409);
  }
  if (!request.stripe_payment_intent_id) {
    return json({ error: "no payment intent on record" }, 409);
  }

  try {
    await stripe.paymentIntents.cancel(
      request.stripe_payment_intent_id,
      { cancellation_reason: isSender ? "requested_by_customer" : "abandoned" },
      { idempotencyKey: `cancel:${request.stripe_payment_intent_id}` }
    );
  } catch (e: any) {
    // Already-cancelled PI is fine — we still want to release the DB row.
    const code = e?.raw?.code;
    if (code !== "payment_intent_unexpected_state") {
      return json({ error: e?.message || "stripe cancel failed" }, 402);
    }
  }

  const update = isSender
    ? {
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      }
    : {
        status: "open",
        courier_id: null,
        accepted_at: null,
        accepted_price_cents: null,
        platform_fee_cents: null,
        stripe_payment_intent_id: null,
      };

  const { error: updateErr } = await supabase
    .from("delivery_requests")
    .update(update)
    .eq("id", delivery_request_id)
    .eq("status", "accepted");

  if (updateErr) {
    return json({ error: "payment released but request update failed", detail: updateErr.message }, 500);
  }

  return json({ delivery_request_id, outcome: isSender ? "cancelled" : "reopened" });
});
