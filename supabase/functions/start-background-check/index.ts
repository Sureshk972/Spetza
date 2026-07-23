import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createCandidate, createInvitation } from "../_shared/checkr.ts";

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
    .select("account_type, selfie_path, stripe_connect_payouts_enabled, background_check_status, checkr_candidate_id")
    .eq("id", user.id)
    .single();

  if (profile?.account_type !== "courier") return json({ error: "only couriers" }, 403);
  if (!profile.selfie_path) return json({ error: "upload a selfie first" }, 409);
  if (!profile.stripe_connect_payouts_enabled) return json({ error: "finish payout setup first" }, 409);
  if (profile.background_check_status === "clear") return json({ error: "already cleared" }, 409);

  // COURIER_PAYS off-ramp (default off): when on, a successful Stripe
  // charge must precede invitation creation. Left as a guarded stub so
  // flipping the flag is a config change, not a rearchitecture.
  if (COURIER_PAYS) {
    return json({ error: "courier-pays flow not yet enabled" }, 501);
  }

  try {
    let candidateId = profile.checkr_candidate_id;
    if (!candidateId) {
      candidateId = await createCandidate(user.id, user.email ?? "");
      // Store candidate id SYNCHRONOUSLY before creating the invitation,
      // so a fast webhook can always match this profile.
      await supabase.from("profiles")
        .update({ checkr_candidate_id: candidateId })
        .eq("id", user.id);
    }
    const invitation = await createInvitation(candidateId);
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
