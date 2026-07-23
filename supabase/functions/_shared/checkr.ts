// Checkr REST helpers + webhook signature verification. Checkr auth is
// HTTP Basic with the API key as username and an empty password.

const CHECKR_API = "https://api.checkr.com/v1";
const API_KEY = Deno.env.get("CHECKR_API_KEY") ?? "";
const PACKAGE = Deno.env.get("CHECKR_PACKAGE_SLUG") ?? "";

function authHeader(): string {
  return "Basic " + btoa(`${API_KEY}:`);
}

export type AppBgStatus = "pending" | "clear" | "consider" | "rejected";

// Map a Checkr webhook event + report status to our app status.
// Returns null for events we ignore.
export function statusForEvent(
  eventType: string,
  reportStatus: string | null,
): AppBgStatus | null {
  if (eventType === "report.created") return "pending";
  if (eventType === "report.suspended") return "pending";
  if (eventType === "report.completed") {
    if (reportStatus === "clear") return "clear";
    if (reportStatus === "consider") return "consider";
    return "pending";
  }
  return null;
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

export async function createCandidate(userId: string, email: string): Promise<string> {
  const res = await fetch(`${CHECKR_API}/candidates`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, custom_id: userId }),
  });
  if (!res.ok) throw new Error(`checkr candidate create failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.id as string;
}

export async function createInvitation(candidateId: string): Promise<{ id: string; url: string }> {
  const res = await fetch(`${CHECKR_API}/invitations`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ candidate_id: candidateId, package: PACKAGE }),
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
