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

  const { data: reviewer } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!reviewer?.is_admin) return json({ error: "admin only" }, 403);

  const { courier_id, decision, notes } = await req.json().catch(() => ({}));
  if (!courier_id) return json({ error: "missing courier_id" }, 400);
  if (decision !== "approved" && decision !== "rejected") {
    return json({ error: "decision must be approved or rejected" }, 400);
  }
  if (decision === "rejected" && (!notes || !String(notes).trim())) {
    return json({ error: "notes required to reject" }, 400);
  }

  const { data: courier, error: courierErr } = await supabase
    .from("profiles")
    .select("id, account_type, verification_status")
    .eq("id", courier_id)
    .single();
  if (courierErr || !courier) return json({ error: "courier not found" }, 404);
  if (courier.account_type !== "courier") return json({ error: "not a courier" }, 409);
  if (courier.verification_status !== "pending") {
    return json({ error: `not pending (status=${courier.verification_status})` }, 409);
  }

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({
      verification_status: decision,
      verification_reviewed_at: new Date().toISOString(),
      verification_reviewer_id: user.id,
      verification_notes: decision === "rejected" ? String(notes).trim() : null,
    })
    .eq("id", courier_id);

  if (updateErr) return json({ error: updateErr.message }, 500);

  return json({ courier_id, decision });
});
