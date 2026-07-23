import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { verifySignature, statusForEvent } from "./checkr.ts";

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
