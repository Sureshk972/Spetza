import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createCandidate, createInvitation, type WorkLocation } from "../_shared/checkr.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const COURIER_PAYS = (Deno.env.get("COURIER_PAYS_BACKGROUND_CHECK") ?? "false") === "true";

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
    .select("account_type, first_name, last_name, selfie_path, stripe_connect_payouts_enabled, background_check_status, checkr_candidate_id, bgcheck_checkout_session_id, bgcheck_paid_at")
    .eq("id", user.id)
    .single();

  if (profile?.account_type !== "courier") return json({ error: "only couriers" }, 403);
  if (!profile.selfie_path) return json({ error: "upload a selfie first" }, 409);
  if (!profile.stripe_connect_payouts_enabled) return json({ error: "finish payout setup first" }, 409);
  if (profile.background_check_status === "clear") return json({ error: "already cleared" }, 409);

  // Guard: Checkr must be configured
  const checkrKey = Deno.env.get("CHECKR_API_KEY");
  if (!checkrKey) {
    return json({ error: "Background checks are not available yet. Please try again later." }, 503);
  }

  // When COURIER_PAYS is on, verify the courier has paid $40 via
  // Stripe Checkout before creating the Checkr invitation.
  if (COURIER_PAYS) {
    if (!profile.bgcheck_checkout_session_id) {
      return json({ error: "payment required — use create-bgcheck-payment first" }, 402);
    }
    if (!profile.bgcheck_paid_at) {
      // Verify with Stripe that the session is actually paid.
      try {
        const session = await stripe.checkout.sessions.retrieve(
          profile.bgcheck_checkout_session_id,
        );
        if (session.payment_status !== "paid") {
          return json({ error: "payment not completed — please try again" }, 402);
        }
        // Mark as paid so subsequent calls skip the Stripe round-trip.
        await supabase.from("profiles").update({
          bgcheck_paid_at: new Date().toISOString(),
        }).eq("id", user.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("bgcheck payment verification failed:", msg);
        return json({ error: "could not verify payment" }, 502);
      }
    }
  }

  if (!profile.first_name || !profile.last_name) {
    return json({ error: "add your first and last name before starting" }, 409);
  }

  // Work location for Checkr compliance — Chicago is the launch market.
  // TODO: derive from courier's service_area when multi-city.
  const workLocations: WorkLocation[] = [
    { country: "US", state: "IL", city: "Chicago" },
  ];

  try {
    let candidateId = profile.checkr_candidate_id;
    if (!candidateId) {
      candidateId = await createCandidate(
        user.id, user.email ?? "", profile.first_name, profile.last_name,
      );
      // Store candidate id SYNCHRONOUSLY before creating the invitation,
      // so a fast webhook can always match this profile.
      await supabase.from("profiles")
        .update({ checkr_candidate_id: candidateId })
        .eq("id", user.id);
    }
    const invitation = await createInvitation(candidateId, workLocations);
    await supabase.from("profiles").update({
      checkr_invitation_id: invitation.id,
      background_check_status: "pending",
      background_check_updated_at: new Date().toISOString(),
    }).eq("id", user.id);
    return json({ invitation_url: invitation.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("start-background-check failed:", msg);
    return json({ error: "could not start background check, try again" }, 502);
  }
});
