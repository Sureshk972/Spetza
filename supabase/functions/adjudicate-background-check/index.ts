import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { startAdverseAction } from "../_shared/checkr.ts";

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

  const { data: reviewer } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  if (!reviewer?.is_admin) return json({ error: "admin only" }, 403);

  const { courier_id, decision, notes } = await req.json().catch(() => ({}));
  if (!courier_id) return json({ error: "missing courier_id" }, 400);
  if (decision !== "approved" && decision !== "rejected") {
    return json({ error: "decision must be approved or rejected" }, 400);
  }
  if (decision === "rejected" && (!notes || !String(notes).trim())) {
    return json({ error: "notes required to reject" }, 400);
  }

  const { data: courier } = await supabase
    .from("profiles")
    .select("background_check_status, checkr_report_id")
    .eq("id", courier_id).single();
  if (!courier) return json({ error: "courier not found" }, 404);
  if (courier.background_check_status !== "consider") {
    return json({ error: `not in consider (status=${courier.background_check_status})` }, 409);
  }

  if (decision === "rejected") {
    if (!courier.checkr_report_id) return json({ error: "no report on record" }, 409);
    try {
      await startAdverseAction(courier.checkr_report_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: `adverse action failed: ${msg}` }, 502);
    }
  }

  const { error } = await supabase.from("profiles").update({
    background_check_status: decision === "approved" ? "clear" : "rejected",
    background_check_notes: notes ? String(notes).trim() : null,
    background_check_reviewed_by: user.id,
    background_check_reviewed_at: new Date().toISOString(),
    background_check_updated_at: new Date().toISOString(),
  }).eq("id", courier_id);
  if (error) return json({ error: error.message }, 500);

  return json({ courier_id, decision });
});
