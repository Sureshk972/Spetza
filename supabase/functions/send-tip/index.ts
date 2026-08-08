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

// Tips are available for 48 hours after delivery.
const TIP_WINDOW_MS = 48 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "missing auth" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const token = auth.replace("Bearer ", "");
  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return json({ error: "unauthenticated" }, 401);

  const { delivery_request_id, tip_cents } = await req.json().catch(() => ({}));
  if (!delivery_request_id) return json({ error: "missing delivery_request_id" }, 400);
  if (!tip_cents || typeof tip_cents !== "number" || tip_cents < 100 || tip_cents > 10000) {
    return json({ error: "tip must be between $1.00 and $100.00" }, 400);
  }

  // Fetch the delivery request
  const { data: request, error: reqErr } = await supabase
    .from("delivery_requests")
    .select("id, sender_id, courier_id, status, delivered_at, tip_cents")
    .eq("id", delivery_request_id)
    .single();
  if (reqErr || !request) return json({ error: "request not found" }, 404);

  // Validations
  if (request.sender_id !== user.id) return json({ error: "not your delivery" }, 403);
  if (request.status !== "delivered") return json({ error: "delivery not complete" }, 409);
  if (request.tip_cents) return json({ error: "tip already sent" }, 409);
  if (!request.courier_id) return json({ error: "no courier assigned" }, 409);

  // Check 48-hour window
  const deliveredAt = new Date(request.delivered_at).getTime();
  if (Date.now() - deliveredAt > TIP_WINDOW_MS) {
    return json({ error: "tip window has closed (48 hours)" }, 410);
  }

  // Get sender's payment method
  const { data: sender } = await supabase
    .from("profiles")
    .select("stripe_customer_id, stripe_default_payment_method_id")
    .eq("id", user.id)
    .single();
  if (!sender?.stripe_customer_id || !sender.stripe_default_payment_method_id) {
    return json({ error: "no payment method on file" }, 409);
  }

  // Get courier's Connect account
  const { data: courier } = await supabase
    .from("profiles")
    .select("stripe_connect_account_id")
    .eq("id", request.courier_id)
    .single();
  if (!courier?.stripe_connect_account_id) {
    return json({ error: "courier not set up for payouts" }, 409);
  }

  // Create and immediately charge a PaymentIntent for the tip.
  // application_fee_amount is 0 — Spetza takes nothing from tips.
  let pi;
  try {
    pi = await stripe.paymentIntents.create(
      {
        amount: tip_cents,
        currency: "usd",
        customer: sender.stripe_customer_id,
        payment_method: sender.stripe_default_payment_method_id,
        confirm: true,
        off_session: true,
        application_fee_amount: 0,
        transfer_data: { destination: courier.stripe_connect_account_id },
        on_behalf_of: courier.stripe_connect_account_id,
        metadata: {
          type: "tip",
          delivery_request_id,
          sender_id: user.id,
          courier_id: request.courier_id,
        },
      },
      { idempotencyKey: `tip:${delivery_request_id}` },
    );
  } catch (e) {
    return json({ error: e?.message || "stripe charge failed" }, 402);
  }

  if (pi.status !== "succeeded") {
    return json({ error: `charge returned status ${pi.status}` }, 402);
  }

  // Record the tip
  await supabase
    .from("delivery_requests")
    .update({
      tip_cents,
      tip_stripe_payment_intent_id: pi.id,
      tipped_at: new Date().toISOString(),
    })
    .eq("id", delivery_request_id)
    .eq("sender_id", user.id);

  return json({ ok: true, tip_cents });
});
