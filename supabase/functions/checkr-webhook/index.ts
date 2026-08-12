import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifySignature, statusForEvent } from "../_shared/checkr.ts";
import { sendPushToUsers } from "../_shared/fcm.ts";

// Terminal states an admin owns — a late/duplicate webhook must never
// overwrite them.
const TERMINAL = new Set(["clear", "rejected"]);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const raw = await req.text();
  const sig = req.headers.get("X-Checkr-Signature") ?? "";
  if (!(await verifySignature(raw, sig))) {
    return new Response("bad signature", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let evt: any;
  try { evt = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  const eventType: string = evt?.type ?? "";
  const obj = evt?.data?.object ?? {};
  const candidateId: string | null = obj?.candidate_id ?? null;
  const reportStatus: string | null = obj?.status ?? null;
  const reportId: string | null = obj?.id ?? null;

  const nextStatus = statusForEvent(eventType, reportStatus);
  if (!nextStatus) return new Response("ignored", { status: 200 });

  if (!candidateId) {
    await supabase.from("checkr_webhook_deadletter").insert({
      event_type: eventType, candidate_id: null, payload: evt, reason: "no candidate_id",
    });
    return new Response("no candidate", { status: 200 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, background_check_status")
    .eq("checkr_candidate_id", candidateId)
    .single();

  if (!profile) {
    await supabase.from("checkr_webhook_deadletter").insert({
      event_type: eventType, candidate_id: candidateId, payload: evt, reason: "profile not found",
    });
    return new Response("no profile", { status: 200 });
  }

  // Guard: never downgrade a terminal admin-owned state.
  if (TERMINAL.has(profile.background_check_status)) {
    return new Response("terminal, ignored", { status: 200 });
  }

  const update: Record<string, unknown> = {
    background_check_status: nextStatus,
    background_check_updated_at: new Date().toISOString(),
  };
  if (reportId) update.checkr_report_id = reportId;

  const { error } = await supabase.from("profiles").update(update).eq("id", profile.id);
  if (error) {
    // Let Checkr retry a bounded number of times, then it dead-letters
    // on its side; surface non-2xx.
    return new Response("db error", { status: 500 });
  }

  // Push notification for background check status changes
  if (nextStatus === "clear") {
    await sendPushToUsers(supabase, [profile.id], {
      title: "You're approved!",
      body: "Your background check cleared. You can now accept deliveries.",
      data: { event: "background_check_clear", deep_link: "/courier/verify" },
    });
  } else if (nextStatus === "consider") {
    await sendPushToUsers(supabase, [profile.id], {
      title: "Background check update",
      body: "Your background check needs review. We'll be in touch.",
      data: { event: "background_check_consider", deep_link: "/courier/verify" },
    });
  }

  return new Response("ok", { status: 200 });
});
