// Handles Stripe Connect webhook events. Currently processes:
// - transfer.paid → push notification to courier about payout
//
// Stripe signs webhooks with the endpoint secret, not a Supabase JWT.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { sendPushToUsers } from "../_shared/fcm.ts";

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

  if (event.type !== "transfer.paid") {
    // Acknowledge events we don't handle
    return new Response("ignored", { status: 200 });
  }

  const transfer = event.data.object as Stripe.Transfer;
  const connectAccountId = transfer.destination as string;
  const amountCents = transfer.amount;

  if (!connectAccountId) {
    console.error("stripe-connect-webhook: transfer.paid missing destination");
    return new Response("ok", { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Look up the courier by their Stripe Connect account ID
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
});
