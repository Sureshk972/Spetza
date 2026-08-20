// Handles Stripe Connect webhook events:
// - transfer.paid    → tell the courier their payout is moving
// - account.updated  → sync charges/payouts flags and tell the courier when
//                      their payout status meaningfully changes
//
// Before account.updated was handled, the app relied entirely on client-side
// polling (refresh-connect-status on profile mount). That meant a courier
// whose payouts got disabled by Stripe found out only if they happened to
// open their profile — while still accepting deliveries they couldn't be
// paid for.
//
// Stripe signs webhooks with the endpoint secret, not a Supabase JWT.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { sendPushToUsers } from "../_shared/fcm.ts";
import { notifyAccount } from "../_shared/accountNotify.ts";

const HANDLED = new Set(["transfer.paid", "account.updated"]);

// Stripe re-sends account.updated on every requirement change. Only nag
// about outstanding requirements once a day.
const REQUIREMENTS_NAG_INTERVAL_MS = 24 * 60 * 60 * 1000;

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const WEBHOOK_SECRET = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET");

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
    console.error("Stripe signature verification failed:", err);
    return new Response("bad signature", { status: 401 });
  }

  if (!HANDLED.has(event.type)) {
    // Acknowledge events we don't handle
    return new Response("ignored", { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── transfer.paid — payout is moving to the courier's bank ──────────
  if (event.type === "transfer.paid") {
    const transfer = event.data.object as Stripe.Transfer;
    const connectAccountId = transfer.destination as string;
    const amountCents = transfer.amount;

    if (!connectAccountId) {
      console.error("stripe-connect-webhook: transfer.paid missing destination");
      return new Response("ok", { status: 200 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("stripe_connect_account_id", connectAccountId)
      .single();

    if (!profile) {
      console.warn(`stripe-connect-webhook: no profile for connect account ${connectAccountId}`);
      return new Response("ok", { status: 200 });
    }

    await sendPushToUsers(supabase, [profile.id], {
      title: "Payout on the way!",
      body: `$${(amountCents / 100).toFixed(2)} is being transferred to your bank account.`,
      data: {
        event: "payout_completed",
        deep_link: "/courier/profile",
      },
    });

    return new Response("ok", { status: 200 });
  }

  // ── account.updated — sync flags, notify on real transitions ────────
  const account = event.data.object as Stripe.Account;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled, stripe_requirements_notified_at",
    )
    .eq("stripe_connect_account_id", account.id)
    .single();

  if (!profile) {
    console.warn(`stripe-connect-webhook: no profile for connect account ${account.id}`);
    return new Response("ok", { status: 200 });
  }

  const wasPayouts = !!profile.stripe_connect_payouts_enabled;
  const nowPayouts = !!account.payouts_enabled;
  const nowCharges = !!account.charges_enabled;
  const currentlyDue = account.requirements?.currently_due ?? [];
  const hasRequirements = currentlyDue.length > 0;

  const update: Record<string, unknown> = {
    stripe_connect_charges_enabled: nowCharges,
    stripe_connect_payouts_enabled: nowPayouts,
  };

  // Decide which transition — if any — is worth telling the courier about.
  // Ordering matters: a payouts flip outranks an outstanding-requirements
  // nag, so we never send both for the same event.
  let accountEvent:
    | "payouts_enabled"
    | "payouts_disabled"
    | "payouts_action_needed"
    | null = null;

  if (!wasPayouts && nowPayouts) {
    accountEvent = "payouts_enabled";
  } else if (wasPayouts && !nowPayouts) {
    accountEvent = "payouts_disabled";
  } else if (hasRequirements) {
    const lastNag = profile.stripe_requirements_notified_at
      ? new Date(profile.stripe_requirements_notified_at).getTime()
      : 0;
    if (Date.now() - lastNag > REQUIREMENTS_NAG_INTERVAL_MS) {
      accountEvent = "payouts_action_needed";
    }
  }

  if (accountEvent === "payouts_action_needed") {
    update.stripe_requirements_notified_at = new Date().toISOString();
  } else if (!hasRequirements) {
    // Requirements resolved — re-arm the nag for next time.
    update.stripe_requirements_notified_at = null;
  }

  const { error: updateErr } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", profile.id);

  if (updateErr) {
    console.error(
      `stripe-connect-webhook: failed to sync flags for ${profile.id}:`,
      updateErr.message,
    );
    return new Response("db error", { status: 500 });
  }

  console.log(
    `stripe-connect-webhook: account.updated ${account.id} -> ` +
      `charges=${nowCharges} payouts=${nowPayouts} due=${currentlyDue.length} ` +
      `notify=${accountEvent ?? "(none)"}`,
  );

  if (accountEvent) {
    await notifyAccount(supabase, profile.id, accountEvent);
  }

  return new Response("ok", { status: 200 });
});
