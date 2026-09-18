import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { stateForEvent, verifySignature } from "../_shared/checkr.ts";
import { notifyAccount } from "../_shared/accountNotify.ts";

// Terminal states an admin owns — a late/duplicate webhook must never
// overwrite them.
const TERMINAL = new Set(["clear", "rejected"]);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const raw = await req.text();
  const sig = req.headers.get("X-Checkr-Signature") ?? "";
  const isStaging = (Deno.env.get("CHECKR_ENV") ?? "production") === "staging";

  // Diagnostics: this used to 401 silently with no log line, which made a
  // failed delivery indistinguishable from "Checkr never called us".
  const sigOk = sig ? await verifySignature(raw, sig) : false;
  console.log(
    `checkr-webhook: sig_present=${!!sig} sig_ok=${sigOk} staging=${isStaging} len=${raw.length}`,
  );

  if (!sigOk) {
    // Staging webhooks configured through the Checkr dashboard are not
    // always signed. Accept them there so the sandbox flow is testable,
    // but never relax this in production.
    if (!isStaging) {
      console.error("checkr-webhook: rejecting unsigned/invalid webhook in production");
      return new Response("bad signature", { status: 401 });
    }
    console.warn("checkr-webhook: signature missing or invalid — allowed (staging only)");
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
  // data.object is a report for report.* events and an invitation for
  // invitation.* events. Both carry `id` and `status`, so only read them as
  // report fields when the event is about a report -- otherwise the invitation
  // id lands in checkr_report_id and the admin "open report" link 404s until
  // report.created overwrites it.
  const isReportEvent = eventType.startsWith("report.");
  const reportStatus: string | null = isReportEvent ? (obj?.status ?? null) : null;
  const reportId: string | null = isReportEvent ? (obj?.id ?? null) : null;

  const reportResult: string | null = obj?.result ?? null;
  const assessment: string | null = obj?.assessment ?? null;
  const includesCanceled: boolean | null =
    typeof obj?.includes_canceled === "boolean" ? obj.includes_canceled : null;

  const next = stateForEvent(eventType, obj);
  const nextStatus = next?.status ?? null;
  console.log(
    `checkr-webhook: type=${eventType} report_status=${reportStatus} ` +
      `report_result=${reportResult} assessment=${assessment} ` +
      `includes_canceled=${includesCanceled} candidate=${candidateId} ` +
      `-> next=${nextStatus ?? "(ignored)"} label=${next?.label ?? "-"}`,
  );
  if (!next) return new Response("ignored", { status: 200 });

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
    console.error(`checkr-webhook: no profile for candidate ${candidateId} — dead-lettering`);
    await supabase.from("checkr_webhook_deadletter").insert({
      event_type: eventType, candidate_id: candidateId, payload: evt, reason: "profile not found",
    });
    return new Response("no profile", { status: 200 });
  }

  // Guard: never downgrade a terminal admin-owned state.
  if (TERMINAL.has(profile.background_check_status)) {
    console.log(`checkr-webhook: profile ${profile.id} already terminal — ignoring`);
    return new Response("terminal, ignored", { status: 200 });
  }

  const update: Record<string, unknown> = {
    background_check_status: next.status,
    background_check_updated_at: new Date().toISOString(),
    checkr_display_status: next.label,
  };
  if (reportId) update.checkr_report_id = reportId;
  if (reportStatus) update.checkr_report_status = reportStatus;
  if (assessment !== null) update.checkr_assessment = assessment;
  if (includesCanceled !== null) update.checkr_includes_canceled = includesCanceled;

  const { error } = await supabase.from("profiles").update(update).eq("id", profile.id);
  if (error) {
    // Let Checkr retry a bounded number of times, then it dead-letters
    // on its side; surface non-2xx.
    console.error(`checkr-webhook: db update failed for ${profile.id}:`, error.message);
    return new Response("db error", { status: 500 });
  }
  console.log(`checkr-webhook: profile ${profile.id} -> ${next.status} (${next.label})`);

  // Notify across every channel that applies. Previously this was push-only,
  // which is invisible on the iOS Safari PWA most couriers use — so in
  // practice a courier was never told their check finished.
  const accountEvent =
    next.status === "clear"
      ? "bgcheck_clear"
      : next.status === "consider"
      ? "bgcheck_consider"
      : next.status === "rejected"
      ? "bgcheck_rejected"
      : next.status === "not_started"
      ? "bgcheck_expired"
      : null;

  if (accountEvent) {
    await notifyAccount(supabase, profile.id, accountEvent);
  }

  return new Response("ok", { status: 200 });
});
