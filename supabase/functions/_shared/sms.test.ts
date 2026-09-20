import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSmsBody } from "./sms.ts";

const base = {
  event: "accepted" as const,
  role: "sender" as const,
  orderNumber: "SPZ-00021",
  deliveryRequestId: "req-1",
  pickupPin: "4821",
  counterpartyName: "Maria",
};

Deno.test("pickup-kind accepted: requester is told the contact has the code, never the PIN", () => {
  const body = buildSmsBody({ ...base, kind: "pickup" })!;
  assert(body.includes("texted the pickup code"));
  assert(!body.includes("{pin}"));
  assert(!/\d{4}/.test(body.replace(base.orderNumber, "")));
});

Deno.test("send-kind accepted: requester gets the PIN", () => {
  const body = buildSmsBody({ ...base, kind: "send" })!;
  assert(body.includes("4821"));
  assertEquals(buildSmsBody(base), body);
});

Deno.test("created: pickup-kind tells the requester their pickup is live", () => {
  const body = buildSmsBody({
    event: "created", role: "sender", kind: "pickup",
    orderNumber: "SPZP-00021", deliveryRequestId: "x",
  });
  assert(body?.includes("Your pickup request is live"));
  assert(!body?.includes("delivery request"));
});
