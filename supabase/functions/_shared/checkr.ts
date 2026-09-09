// Checkr REST helpers + webhook signature verification. Checkr auth is
// HTTP Basic with the API key as username and an empty password.
//
// Set CHECKR_ENV=staging for sandbox; defaults to production.

const IS_STAGING = (Deno.env.get("CHECKR_ENV") ?? "production") === "staging";
const CHECKR_API = IS_STAGING
  ? "https://api.checkr-staging.com/v1"
  : "https://api.checkr.com/v1";
const API_KEY = Deno.env.get("CHECKR_API_KEY") ?? "";
const PACKAGE = Deno.env.get("CHECKR_PACKAGE_SLUG") ?? "";

function authHeader(): string {
  return "Basic " + btoa(`${API_KEY}:`);
}

export interface WorkLocation {
  country: string;
  state: string;
  city?: string;
}

export type AppBgStatus = "not_started" | "pending" | "clear" | "consider" | "rejected";

// A Checkr report object, as it arrives in data.object on report.* events.
export interface CheckrReport {
  status?: string | null;           // pending | complete | suspended | dispute | canceled
  result?: string | null;           // clear | consider  — the RAW verdict
  assessment?: string | null;       // eligible | review | escalated — Assess tag
  adjudication?: string | null;     // pre_adverse_action | post_adverse_action | engaged
  includes_canceled?: boolean | null;
  id?: string | null;
  candidate_id?: string | null;
}

// What one webhook means for us: the gate value we store, plus the label
// Checkr expects us to display.
export interface ReportState {
  status: AppBgStatus;
  label: string;
}

// Resolve a report's verdict per Checkr's REQUIRED Assess rule (Customer API
// Integration Guidance v3.0, "Webhooks and Status Mappings"):
//
//   "First look at the assessment field and, if any value exists in that
//    field, use that value; if no value exists, use the value from the
//    result field."
//
// This matters both ways. A report with charges that Assess marks `eligible`
// is a pass — reading `result` alone would block that courier. A report Assess
// marks `review` needs a human — reading `result` alone would clear them.
export function verdictFor(report: CheckrReport | null): string | null {
  const assessment = report?.assessment ?? null;
  if (assessment) return assessment;
  return report?.result ?? null;
}

// Map a whole Checkr webhook event to the state we store.
//
// Spetza is an SMB integration by Checkr's definition — one person handles
// both recruiting and adjudication — so we use the SMB column of their
// mapping table: results display immediately rather than waiting for
// report.engaged, and we do not pull cancellation reasons.
//
// A Checkr report carries THREE fields that are easy to confuse:
//   status      — the operational state (pending / complete / suspended / ...)
//   result      — the raw verdict (clear / consider)
//   assessment  — the Assess tag applied on top of the raw verdict
// Reading `status` where the verdict was meant parked every passing courier
// at "pending" until 2026-09-09. Hence verdictFor() above, and hence the
// table-driven tests.
export function stateForEvent(
  eventType: string,
  report: CheckrReport | null,
): ReportState | null {
  switch (eventType) {
    case "invitation.created":
      return { status: "pending", label: "Invitation sent" };
    case "invitation.completed":
      return { status: "pending", label: "Pending" };
    case "invitation.expired":
      // Let the courier start over.
      return { status: "not_started", label: "Invitation expired" };
    case "invitation.deleted":
      return { status: "not_started", label: "Invitation canceled" };

    case "report.created":
      return { status: "pending", label: "Pending" };
    case "report.suspended":
      return { status: "pending", label: "Suspended" };
    case "report.resumed":
      return { status: "pending", label: "Pending" };

    case "report.disputed":
      // Only reachable on a consider report; stays with the admin.
      return { status: "consider", label: "Disputed" };

    case "report.canceled":
      // Every screening was canceled before any of them processed, so there
      // is no verdict at all. Not "clear", and not silently retryable — an
      // admin decides, because the courier has already paid.
      return { status: "consider", label: "Canceled" };

    case "report.pre_adverse_action":
      return { status: "consider", label: "Pre-adverse action" };
    case "report.post_adverse_action":
      return { status: "rejected", label: "Not eligible" };
    case "report.engaged":
      return { status: "clear", label: "Clear" };

    case "report.completed": {
      const verdict = verdictFor(report);
      const partial = report?.includes_canceled === true;

      // Partially completed with nothing reportable: no verdict to act on.
      if (partial && !report?.result && !report?.assessment) {
        return { status: "consider", label: "Canceled" };
      }

      // The one place Checkr's own two rules disagree. The Assess precedence
      // rule says assessment wins; the mapping table's partial-clear row
      // (result=clear, assessment=review) says an SMB integration should show
      // "Clear w Canceled". The table wins here, because on a partially
      // completed report the "review" tag is describing the canceled
      // screenings — which we already surface — rather than a finding on the
      // candidate. Escalated is left alone: that is Assess Premium flagging
      // something real, so it still goes to a human.
      if (partial && report?.result === "clear" && report?.assessment !== "escalated") {
        return { status: "clear", label: "Clear w/ canceled screenings" };
      }

      if (verdict === "eligible" || verdict === "clear") {
        return partial
          ? { status: "clear", label: "Clear w/ canceled screenings" }
          : { status: "clear", label: "Clear" };
      }
      if (verdict === "review" || verdict === "escalated" || verdict === "consider") {
        return partial
          ? { status: "consider", label: "Needs review w/ canceled screenings" }
          : { status: "consider", label: "Needs review" };
      }
      // Completed but unreadable — never guess a pass.
      return { status: "consider", label: "Needs review" };
    }
  }
  return null;
}

// Back-compat wrapper. Prefer stateForEvent.
export function statusForReport(
  eventType: string,
  report: CheckrReport | null,
): AppBgStatus | null {
  return stateForEvent(eventType, report)?.status ?? null;
}

// Constant-time-ish HMAC-SHA256 hex comparison.
export async function verifySignature(
  rawBody: string,
  signatureHex: string,
  key = API_KEY,
): Promise<boolean> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(rawBody));
  const computed = [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  if (computed.length !== signatureHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ signatureHex.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function createCandidate(
  userId: string,
  email: string,
  firstName: string,
  lastName: string,
  workLocations: WorkLocation[],
): Promise<string> {
  // work_locations is REQUIRED on the candidate call, not just the invitation
  // (Customer API Integration Guidance v3.0, "Create Candidate API Call" —
  // country and state are compliance-required for Account Hierarchy).
  //
  // Deliberately NOT sent, per the same document: ssn, dob, driver license.
  // They do not pre-populate the invitation, and dob would expose PII if the
  // candidate's email were entered wrong.
  const res = await fetch(`${CHECKR_API}/candidates`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      first_name: firstName,
      last_name: lastName,
      email,
      custom_id: userId,
      work_locations: workLocations,
    }),
  });
  if (!res.ok) throw new Error(`checkr candidate create failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.id as string;
}

export async function createInvitation(
  candidateId: string,
  workLocations: WorkLocation[],
): Promise<{ id: string; url: string }> {
  const res = await fetch(`${CHECKR_API}/invitations`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      candidate_id: candidateId,
      package: PACKAGE,
      work_locations: workLocations,
    }),
  });
  if (!res.ok) throw new Error(`checkr invitation create failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { id: data.id as string, url: data.invitation_url as string };
}

// Trigger Checkr's Adverse Action workflow (sends the FCRA pre-adverse +
// adverse-action notices and runs the waiting period).
export async function startAdverseAction(reportId: string): Promise<void> {
  const res = await fetch(`${CHECKR_API}/reports/${reportId}/adverse_actions`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({}),
  });
  if (!res.ok) throw new Error(`checkr adverse action failed: ${res.status} ${await res.text()}`);
}
