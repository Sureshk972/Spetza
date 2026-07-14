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
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const token = auth.replace("Bearer ", "");
  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return json({ error: "unauthenticated" }, 401);

  const { payment_method_id } = await req.json().catch(() => ({}));
  if (!payment_method_id) return json({ error: "missing payment_method_id" }, 400);

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, stripe_default_payment_method_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return json({ error: "no stripe customer" }, 409);
  }

  let pm;
  try {
    pm = await stripe.paymentMethods.retrieve(payment_method_id);
  } catch (e) {
    return json({ error: e?.message || "stripe error" }, 502);
  }
  if (pm.customer !== profile.stripe_customer_id) {
    return json({ error: "payment method does not belong to caller" }, 403);
  }

  try {
    await stripe.paymentMethods.detach(payment_method_id);
  } catch (e) {
    return json({ error: e?.message || "stripe error" }, 502);
  }

  if (profile.stripe_default_payment_method_id === payment_method_id) {
    await supabase
      .from("profiles")
      .update({ stripe_default_payment_method_id: null })
      .eq("id", user.id);
  }

  return json({ ok: true });
});
