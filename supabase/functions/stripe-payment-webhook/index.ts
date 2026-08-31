// Handles the payment events that arrive after the fact:
// - charge.dispute.created         → record it, alert the operator
// - charge.dispute.closed          → record the outcome, alert the operator
// - payment_intent.payment_failed  → alert the operator
//
// Separate from stripe-connect-webhook, which listens for Connect account
// events (transfer.paid, account.updated) and is signed with its own secret.
// Stripe signs each endpoint with a different secret, so these cannot share
// a function without one of them failing verification.
//
// Charges here are destination charges with on_behalf_of set to the courier's
// connected account, so depending on how the endpoint is registered these can
// arrive as either platform or connected-account events. The handler doesn't
// care: it resolves everything from the charge's payment intent metadata.
//
// Everything is keyed on Stripe's own ids, because Stripe re-delivers an
// event on every status change and again whenever we answer non-2xx.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { sendOperatorAlert, money } from "../_shared/operatorAlert.ts";

const HANDLED = new Set([
  "charge.dispute.created",
  "charge.dispute.closed",
  "payment_intent.payment_failed",
]);

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const WEBHOOK_SECRET = Deno.env.get("STRIPE_PAYMENT_WEBHOOK_SECRET");

const dashboardUrl = (path: string) => `https://dashboard.stripe.com/${path}`;

/** Stripe sends seconds; the database wants a timestamp. */
const toIso = (seconds: number | null | undefined): string | null =>
  seconds ? new Date(seconds * 1000).toISOString() : null;

/**
 * Everything we know about who a charge belonged to.
 *
 * accept-delivery-request stamps delivery_request_id, sender_id and courier_id
 * onto the payment intent's metadata. Tips carry `type: "tip"` instead, and a
 * dispute against one still has to be recorded — hence every field nullable.
 */
async function resolveParties(paymentIntentId: string | null) {
  if (!paymentIntentId) return {};
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const m = pi.metadata || {};
    return {
      delivery_request_id: m.delivery_request_id || null,
      sender_id: m.sender_id || null,
      courier_id: m.courier_id || null,
      isTip: m.type === "tip",
    };
  } catch (e) {
    // A dispute we can't attribute is still a dispute worth telling someone about.
    console.error("stripe-payment-webhook: could not retrieve payment intent", paymentIntentId, e);
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !WEBHOOK_SECRET) {
    return new Response("missing signature or webhook secret", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("stripe-payment-webhook: signature verification failed:", err);
    return new Response("bad signature", { status: 401 });
  }

  if (!HANDLED.has(event.type)) {
    return new Response("ignored", { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── charge.dispute.created / closed ────────────────────────────────
  if (event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") {
    const dispute = event.data.object as Stripe.Dispute;
    const closed = event.type === "charge.dispute.closed";

    const paymentIntentId =
      typeof dispute.payment_intent === "string"
        ? dispute.payment_intent
        : dispute.payment_intent?.id || null;

    const parties = await resolveParties(paymentIntentId);
    const evidenceDueAt = toIso(dispute.evidence_details?.due_by);

    const { error: upsertErr } = await supabase
      .from("payment_disputes")
      .upsert(
        {
          stripe_dispute_id: dispute.id,
          stripe_charge_id: typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id,
          stripe_payment_intent_id: paymentIntentId,
          delivery_request_id: parties.delivery_request_id ?? null,
          sender_id: parties.sender_id ?? null,
          courier_id: parties.courier_id ?? null,
          amount_cents: dispute.amount,
          currency: dispute.currency,
          reason: dispute.reason,
          status: dispute.status,
          evidence_due_at: evidenceDueAt,
          closed_at: closed ? new Date().toISOString() : null,
          outcome: closed ? dispute.status : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "stripe_dispute_id" },
      );

    if (upsertErr) {
      // Answer non-2xx so Stripe re-delivers rather than dropping it.
      console.error("stripe-payment-webhook: dispute upsert failed", upsertErr);
      return new Response("dispute upsert failed", { status: 500 });
    }

    // Flag the delivery so listings can show it without a join. A dispute
    // resolved in our favour clears the flag; one lost leaves it set.
    if (parties.delivery_request_id) {
      const won = closed && dispute.status === "won";
      const { error: flagErr } = await supabase
        .from("delivery_requests")
        .update({ disputed_at: won ? null : new Date().toISOString() })
        .eq("id", parties.delivery_request_id);
      if (flagErr) console.error("stripe-payment-webhook: could not flag delivery", flagErr);
    }

    const rows: Array<[string, string]> = [
      ["Amount", money(dispute.amount)],
      ["Reason", dispute.reason || "unspecified"],
      ["Status", dispute.status],
    ];
    if (parties.delivery_request_id) rows.push(["Delivery", parties.delivery_request_id]);
    if (parties.isTip) rows.push(["Note", "Dispute is against a tip, not a delivery charge"]);
    if (!closed && evidenceDueAt) {
      rows.push(["Evidence due", new Date(evidenceDueAt).toUTCString()]);
    }

    await sendOperatorAlert(
      closed
        ? `Dispute ${dispute.status} — ${money(dispute.amount)}`
        : `Card dispute opened — ${money(dispute.amount)}`,
      closed
        ? `A dispute closed as "${dispute.status}". No further action is possible on it.`
        : "A sender has disputed a charge. Stripe forfeits the money by default if " +
          "no evidence is submitted before the deadline below.",
      rows,
      dashboardUrl(`payments/${dispute.charge}`),
    );

    return new Response("ok", { status: 200 });
  }

  // ── payment_intent.payment_failed ──────────────────────────────────
  // The synchronous paths already surface their own failures: accept
  // returns 402 to the courier, and so does capture at the doorstep. This
  // catches the rest -- an authorization expiring, or an off-session charge
  // failing outside a request anyone is watching.
  const pi = event.data.object as Stripe.PaymentIntent;
  const m = pi.metadata || {};
  const failure = pi.last_payment_error;

  const rows: Array<[string, string]> = [
    ["Amount", money(pi.amount)],
    ["Reason", failure?.message || failure?.code || "unspecified"],
    ["Intent", pi.id],
  ];
  if (m.delivery_request_id) rows.push(["Delivery", m.delivery_request_id]);
  if (m.type === "tip") rows.push(["Note", "Failure is on a tip, not a delivery charge"]);

  await sendOperatorAlert(
    `Payment failed — ${money(pi.amount)}`,
    "A payment failed outside the flows that report failure to the person in front of it. " +
      "Nobody has necessarily been told.",
    rows,
    dashboardUrl(`payments/${pi.id}`),
  );

  return new Response("ok", { status: 200 });
});
