import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { verifyStripeEvent } from "./stripeWebhook.ts";

const SECRET_A = "whsec_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SECRET_B = "whsec_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const BODY = JSON.stringify({ id: "evt_1", type: "charge.dispute.created", data: { object: {} } });

const stripe = new Stripe("sk_test_stub", { apiVersion: "2024-06-20" });

/** Signs a body the way Stripe does: HMAC-SHA256 over "<timestamp>.<body>". */
async function sign(body: string, secret: string): Promise<string> {
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${t},v1=${hex}`;
}

// The regression this file exists for. `constructEvent` needs a synchronous
// HMAC, and the only crypto provider available on Deno is SubtleCrypto, which
// is async-only -- so the sync call throws on a signature that is perfectly
// valid. It fails as a plain 401, which reads exactly like a forgery, so
// nothing about it is visible without a test like this one.
Deno.test("the synchronous constructEvent cannot verify even a valid signature", async () => {
  const sig = await sign(BODY, SECRET_A);
  let message: string | null = null;
  try {
    stripe.webhooks.constructEvent(BODY, sig, SECRET_A);
  } catch (e) {
    message = (e as Error).message;
  }
  assert(
    message?.includes("synchronous context"),
    `expected a synchronous-context error, got: ${message}`,
  );
});

Deno.test("verifyStripeEvent accepts a signature from the only configured secret", async () => {
  const event = await verifyStripeEvent(stripe, BODY, await sign(BODY, SECRET_A), [SECRET_A]);
  assertEquals(event?.id, "evt_1");
});

Deno.test("verifyStripeEvent accepts either destination's secret", async () => {
  const secrets = [SECRET_A, SECRET_B];
  assertEquals((await verifyStripeEvent(stripe, BODY, await sign(BODY, SECRET_A), secrets))?.id, "evt_1");
  assertEquals((await verifyStripeEvent(stripe, BODY, await sign(BODY, SECRET_B), secrets))?.id, "evt_1");
});

Deno.test("verifyStripeEvent rejects a signature no secret matches", async () => {
  assertEquals(await verifyStripeEvent(stripe, BODY, await sign(BODY, SECRET_A), [SECRET_B]), null);
});

Deno.test("verifyStripeEvent rejects a body altered after signing", async () => {
  const sig = await sign(BODY, SECRET_A);
  assertEquals(await verifyStripeEvent(stripe, `${BODY} `, sig, [SECRET_A, SECRET_B]), null);
});

Deno.test("verifyStripeEvent rejects everything when no secret is configured", async () => {
  assertEquals(await verifyStripeEvent(stripe, BODY, await sign(BODY, SECRET_A), []), null);
});
