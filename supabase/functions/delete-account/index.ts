// Self-serve account deletion.
//
// The Privacy Policy has always told people they can delete their personal
// information from their profile settings. Until now nothing did.
//
// This scrubs rather than drops the row -- see the migration for why a hard
// delete is impossible here without destroying other people's records. What
// leaves: name, phone, verification selfie, push tokens, messaging consent,
// and the ability to sign in. What stays: delivery and payment rows, with the
// person behind them anonymous.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Anything not finished is a live obligation to someone else.
const ACTIVE_STATUSES = ["open", "accepted", "picked_up"];

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

  // Refuse while anything is in flight. Deleting mid-delivery would strand a
  // counterparty with an authorized card or an undelivered package and no one
  // to contact.
  const { data: active, error: activeErr } = await supabase
    .from("delivery_requests")
    .select("id, status")
    .or(`sender_id.eq.${user.id},courier_id.eq.${user.id}`)
    .in("status", ACTIVE_STATUSES)
    .limit(1);

  if (activeErr) {
    console.error("delete-account: active check failed", activeErr);
    return json({ error: "could not check your deliveries" }, 500);
  }
  if (active && active.length > 0) {
    return json(
      {
        error: "You have a delivery in progress. Finish or cancel it first.",
        code: "active_delivery",
      },
      409,
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("selfie_path")
    .eq("id", user.id)
    .maybeSingle();

  // Stored files go first: if a later step fails we would rather have an
  // account that still works than a live account whose selfie has vanished.
  if (profile?.selfie_path) {
    await supabase.storage.from("courier-verification").remove([profile.selfie_path])
      .catch((e: unknown) => console.error("delete-account: selfie removal failed", e));
  }
  await supabase.from("push_tokens").delete().eq("user_id", user.id);

  const { error: scrubErr } = await supabase
    .from("profiles")
    .update({
      first_name: null,
      last_name: null,
      phone_number: null,
      phone_verified_at: null,
      is_phone_verified: false,
      selfie_path: null,
      sms_notifications_enabled: false,
      sms_consent_at: null,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (scrubErr) {
    console.error("delete-account: scrub failed", scrubErr);
    return json({ error: "could not delete your account" }, 500);
  }

  // Lock the login last. A ban rather than a delete: deleting the auth user
  // cascades into delivery_requests and would take other people's history
  // with it.
  const { error: banErr } = await supabase.auth.admin.updateUserById(user.id, {
    ban_duration: "876000h", // 100 years
  });
  if (banErr) {
    // The data is already gone, so report success rather than inviting a
    // retry that can't improve anything -- but make it loud in the logs,
    // because a signed-in session could still be usable until it expires.
    console.error("delete-account: ban failed, account data already scrubbed", banErr);
  }

  return json({ ok: true });
});
