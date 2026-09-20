import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pickupBlockedReason } from "./pickupRules.ts";

const id = "11111111-2222-3333-4444-555555555555";

Deno.test("send-kind requests never need a pickup photo", () => {
  assertEquals(pickupBlockedReason("send", null, id), null);
});

Deno.test("pickup-kind requests need the photo before the PIN", () => {
  assertEquals(pickupBlockedReason("pickup", null, id), "photo_required");
  assertEquals(pickupBlockedReason("pickup", "", id), "photo_required");
  assertEquals(pickupBlockedReason("pickup", `${id}/item.jpg`, id), null);
});

Deno.test("pickup-kind: a photo from another delivery does not count", () => {
  assertEquals(pickupBlockedReason("pickup", "other-request/item.jpg", id), "photo_required");
  assertEquals(pickupBlockedReason("pickup", `${id}item.jpg`, id), "photo_required");
});
