import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pickupBlockedReason } from "./pickupRules.ts";

Deno.test("send-kind requests never need a pickup photo", () => {
  assertEquals(pickupBlockedReason("send", null), null);
});

Deno.test("pickup-kind requests need the photo before the PIN", () => {
  assertEquals(pickupBlockedReason("pickup", null), "photo_required");
  assertEquals(pickupBlockedReason("pickup", ""), "photo_required");
  assertEquals(pickupBlockedReason("pickup", "abc/def.jpg"), null);
});
