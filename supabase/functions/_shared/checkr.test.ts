import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { verifySignature, statusForEvent, statusForReport } from "./checkr.ts";

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

Deno.test("statusForEvent maps Checkr events to app status", () => {
  assertEquals(statusForEvent("report.created", null), "pending");
  assertEquals(statusForEvent("report.completed", "clear"), "clear");
  assertEquals(statusForEvent("report.completed", "consider"), "consider");
  assertEquals(statusForEvent("report.suspended", null), "pending");
  assertEquals(statusForEvent("candidate.created", null), null);
});

// Regression: these use the SHAPE Checkr actually sends. The older
// statusForEvent tests fed the verdict in directly, which is the one thing
// the webhook never did — so they stayed green while every completed
// report was being written as "pending".
Deno.test("statusForReport reads result, not status, on a completed report", () => {
  // Real shape from report 9ab9b32b2feacd90b7323386 (2026-09-09).
  const cleared = { status: "complete", result: "clear", id: "rpt_1" };
  assertEquals(statusForReport("report.completed", cleared), "clear");

  const considered = { status: "complete", result: "consider", id: "rpt_2" };
  assertEquals(statusForReport("report.completed", considered), "consider");
});

Deno.test("statusForReport still uses status for non-completed events", () => {
  // Real shape from the 2026-08-25 dead-letter: result is null here.
  const suspended = { status: "suspended", result: null, id: "rpt_3" };
  assertEquals(statusForReport("report.suspended", suspended), "pending");

  const created = { status: "pending", result: null, id: "rpt_4" };
  assertEquals(statusForReport("report.created", created), "pending");

  assertEquals(statusForReport("candidate.created", null), null);
});
