import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { invitationBody, stateForEvent, verdictFor, verifySignature } from "./checkr.ts";

Deno.test("verifySignature accepts a correct HMAC-SHA256 hex", async () => {
  const key = "test_key";
  const body = '{"type":"report.completed"}';
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(body));
  const hex = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  assertEquals(await verifySignature(body, hex, key), true);
  assertEquals(await verifySignature(body, "deadbeef", key), false);
});

// Checkr's REQUIRED Assess rule: assessment wins whenever it has a value.
Deno.test("verdictFor prefers assessment over result", () => {
  assertEquals(verdictFor({ result: "consider", assessment: "eligible" }), "eligible");
  assertEquals(verdictFor({ result: "clear", assessment: "review" }), "review");
  assertEquals(verdictFor({ result: "clear", assessment: null }), "clear");
  assertEquals(verdictFor({ result: null, assessment: null }), null);
  assertEquals(verdictFor(null), null);
});

// Every row of the "Webhooks and Status Mappings" table in Checkr's Customer
// API Integration Guidance v3.0, SMB column. If Checkr revises the table,
// this is the list to re-check.
const TABLE: Array<{
  name: string;
  event: string;
  report: Record<string, unknown> | null;
  status: string;
  label: string;
}> = [
  { name: "invitation sent", event: "invitation.created", report: null,
    status: "pending", label: "Invitation sent" },
  { name: "invitation completed", event: "invitation.completed", report: null,
    status: "pending", label: "Pending" },
  { name: "invitation expired", event: "invitation.expired", report: null,
    status: "not_started", label: "Invitation expired" },
  { name: "invitation deleted", event: "invitation.deleted", report: null,
    status: "not_started", label: "Invitation canceled" },

  { name: "fully complete, clear, eligible", event: "report.completed",
    report: { status: "complete", includes_canceled: false, result: "clear", assessment: "eligible" },
    status: "clear", label: "Clear" },
  { name: "fully complete, clear, no Assess", event: "report.completed",
    report: { status: "complete", includes_canceled: false, result: "clear", assessment: null },
    status: "clear", label: "Clear" },
  { name: "consider but Assess says eligible", event: "report.completed",
    report: { status: "complete", includes_canceled: false, result: "consider", assessment: "eligible" },
    status: "clear", label: "Clear" },
  { name: "consider, Assess says review", event: "report.completed",
    report: { status: "complete", includes_canceled: false, result: "consider", assessment: "review" },
    status: "consider", label: "Needs review" },
  { name: "consider, Assess says escalated", event: "report.completed",
    report: { status: "complete", includes_canceled: false, result: "consider", assessment: "escalated" },
    status: "consider", label: "Needs review" },
  { name: "partial, nothing reportable", event: "report.completed",
    report: { status: "complete", includes_canceled: true, result: null, assessment: null },
    status: "consider", label: "Canceled" },
  { name: "partial, clear", event: "report.completed",
    report: { status: "complete", includes_canceled: true, result: "clear", assessment: "review" },
    status: "clear", label: "Clear w/ canceled screenings" },
  { name: "partial, consider", event: "report.completed",
    report: { status: "complete", includes_canceled: true, result: "consider", assessment: "review" },
    status: "consider", label: "Needs review w/ canceled screenings" },

  { name: "pre-adverse action", event: "report.pre_adverse_action",
    report: { status: "complete", result: "consider", adjudication: "pre_adverse_action" },
    status: "consider", label: "Pre-adverse action" },
  { name: "post-adverse action", event: "report.post_adverse_action",
    report: { status: "complete", result: "consider", adjudication: "post_adverse_action" },
    status: "rejected", label: "Not eligible" },
  { name: "engaged", event: "report.engaged",
    report: { status: "complete", adjudication: "engaged" },
    status: "clear", label: "Clear" },
  { name: "suspended", event: "report.suspended",
    report: { status: "suspended", result: null },
    status: "pending", label: "Suspended" },
  { name: "resumed", event: "report.resumed",
    report: { status: "pending", result: null },
    status: "pending", label: "Pending" },
  { name: "disputed", event: "report.disputed",
    report: { status: "dispute", result: null },
    status: "consider", label: "Disputed" },
  { name: "fully canceled", event: "report.canceled",
    report: { status: "canceled", result: null },
    status: "consider", label: "Canceled" },
];

for (const row of TABLE) {
  Deno.test(`mapping: ${row.name}`, () => {
    const state = stateForEvent(row.event, row.report);
    assertEquals(state?.status, row.status);
    assertEquals(state?.label, row.label);
  });
}

Deno.test("unknown events are ignored, not guessed at", () => {
  assertEquals(stateForEvent("candidate.created", null), null);
  assertEquals(stateForEvent("", null), null);
});

// Regression, 2026-09-09: the webhook passed report.status ("complete") where
// a verdict was expected, so every passing courier was written as "pending"
// and could never accept a delivery. Real payload from report
// 9ab9b32b2feacd90b7323386.
Deno.test("a completed report is never written as pending", () => {
  const real = { status: "complete", result: "clear", assessment: "eligible", id: "9ab9b32b2feacd90b7323386" };
  assertEquals(stateForEvent("report.completed", real)?.status, "clear");
});

// A completed report we cannot read must land with a human, not pass.
Deno.test("an unreadable completed report needs review", () => {
  assertEquals(
    stateForEvent("report.completed", { status: "complete", result: "wat", assessment: null })?.status,
    "consider",
  );
});

// Account hierarchy. Checkr makes `node` mandatory on every invitation the
// moment one node exists on the account — created by clicking around their
// dashboard, not by us. Unset must behave exactly as before; set must send it.
Deno.test("invitation omits node when none is configured", () => {
  Deno.env.delete("CHECKR_NODE_ID");
  const body = invitationBody("cand_1", [{ country: "US", state: "IL", city: "Chicago" }]);
  assertEquals("node" in body, false);
  assertEquals(body.candidate_id, "cand_1");
});

Deno.test("invitation sends node when one is configured", () => {
  Deno.env.set("CHECKR_NODE_ID", "chicago");
  try {
    const body = invitationBody("cand_2", [{ country: "US", state: "IL", city: "Chicago" }]);
    assertEquals(body.node, "chicago");
  } finally {
    Deno.env.delete("CHECKR_NODE_ID");
  }
});
