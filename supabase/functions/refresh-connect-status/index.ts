// Reads the courier's current Stripe Express account and syncs
// stripe_connect_charges_enabled + stripe_connect_payouts_enabled
// on their profile. Called from the client on CourierProfile mount
// so the flags self-heal after Express onboarding completes — there
// is no account.updated webhook wired yet.

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_connect_account_id, account_type")
    .eq("id", user.id)
    .single();

  if (profile?.account_type !== "courier") {
    return json({ error: "only couriers can sync payouts" }, 403);
  }
  if (!profile.stripe_connect_account_id) {
    return json({ synced: false, reason: "no_account" });
  }

  let acct;
  try {
    acct = await stripe.accounts.retrieve(profile.stripe_connect_account_id);
  } catch (e) {
    return json({ error: e?.message || "stripe error" }, 502);
  }

  const chargesEnabled = !!acct.charges_enabled;
  const payoutsEnabled = !!acct.payouts_enabled;

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({
      stripe_connect_charges_enabled: chargesEnabled,
      stripe_connect_payouts_enabled: payoutsEnabled,
    })
    .eq("id", user.id);
  if (updateErr) {
    return json({ error: "db_error", detail: updateErr.message }, 500);
  }

  return json({
    synced: true,
    charges_enabled: chargesEnabled,
    payouts_enabled: payoutsEnabled,
  });
});
