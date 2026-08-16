import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const BGCHECK_PRICE_CENTS = 4000; // $40

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type, selfie_path, stripe_connect_payouts_enabled, background_check_status, bgcheck_paid_at")
    .eq("id", user.id)
    .single();

  if (profile?.account_type !== "courier") return json({ error: "only couriers" }, 403);
  if (!profile.selfie_path) return json({ error: "upload a selfie first" }, 409);
  if (!profile.stripe_connect_payouts_enabled) return json({ error: "finish payout setup first" }, 409);
  if (profile.background_check_status === "clear") return json({ error: "already cleared" }, 409);
  if (profile.bgcheck_paid_at) return json({ error: "already paid" }, 409);

  // Parse the return URL from the request body, fall back to default.
  const { return_url } = await req.json().catch(() => ({}));
  const successUrl = return_url
    ? `${return_url}?bg_paid=1&session_id={CHECKOUT_SESSION_ID}`
    : "https://spetza.com/courier/verify?bg_paid=1&session_id={CHECKOUT_SESSION_ID}";
  const cancelUrl = return_url || "https://spetza.com/courier/verify";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: BGCHECK_PRICE_CENTS,
          product_data: {
            name: "Background check",
            description: "One-time Checkr background check for Spetza courier verification",
          },
        },
        quantity: 1,
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        courier_id: user.id,
        purpose: "background_check",
      },
      payment_intent_data: {
        metadata: {
          courier_id: user.id,
          purpose: "background_check",
        },
      },
    }, { idempotencyKey: `bgcheck-payment:${user.id}` });

    // Store the session ID so start-background-check can verify it later.
    await supabase.from("profiles").update({
      bgcheck_checkout_session_id: session.id,
    }).eq("id", user.id);

    return json({ checkout_url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("create-bgcheck-payment failed:", msg);
    return json({ error: "could not create payment session" }, 502);
  }
});
