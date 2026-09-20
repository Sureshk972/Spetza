import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pickupContactSms } from "./pickupContact.ts";

const ctx = {
  orderNumber: "SPZ-00021",
  courierName: "Maria",
  requesterName: "Suresh",
  description: "Blue jacket",
  pin: "4821",
};

Deno.test("accepted: names both people, tells the contact what to check, gives the PIN", () => {
  assertEquals(
    pickupContactSms("accepted", ctx),
    "Spetza: Maria is picking up \"Blue jacket\" for Suresh. Before handing it over, ask to see the job on their phone — it shows SPZ-00021 and your name. Then give them PIN 4821. Reply STOP to opt out.",
  );
});

Deno.test("arrived: short heads-up", () => {
  assertEquals(pickupContactSms("arrived", ctx), "Spetza: Maria is outside for the pickup.");
});

Deno.test("other events: nothing to the contact", () => {
  assertEquals(pickupContactSms("picked_up", ctx), null);
  assertEquals(pickupContactSms("created", ctx), null);
});

Deno.test("missing names fall back without breaking the sentence", () => {
  assertEquals(
    pickupContactSms("arrived", { ...ctx, courierName: null }),
    "Spetza: Your courier is outside for the pickup.",
  );
});
