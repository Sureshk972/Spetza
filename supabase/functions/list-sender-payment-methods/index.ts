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

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, stripe_default_payment_method_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return json({ payment_methods: [], default_payment_method_id: null });
  }

  let pms;
  try {
    pms = await stripe.paymentMethods.list({ customer: profile.stripe_customer_id, type: "card" });
  } catch (e) {
    return json({ error: e?.message || "stripe error" }, 502);
  }

  const shaped = pms.data.map((pm) => ({
    id: pm.id,
    brand: pm.card?.brand ?? null,
    last4: pm.card?.last4 ?? null,
    exp_month: pm.card?.exp_month ?? null,
    exp_year: pm.card?.exp_year ?? null,
  }));

  return json({
    payment_methods: shaped,
    default_payment_method_id: profile.stripe_default_payment_method_id ?? null,
  });
});
