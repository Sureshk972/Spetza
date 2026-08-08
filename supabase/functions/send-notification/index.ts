// Called by a Postgres trigger (via pg_net) whenever a delivery_requests
// row changes lifecycle state. Looks up the delivery + sender/courier
// profiles and auth emails, then sends the appropriate transactional
// emails. Non-blocking: always returns 200 so a trigger's fire-and-forget
// HTTP call never fails, even if email delivery itself fails.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendDeliveryEmail, type DeliveryEvent } from "../_shared/email.ts";

const VALID_EVENTS: DeliveryEvent[] = [
  "created",
  "accepted",
  "picked_up",
  "delivered",
  "cancelled",
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  // Guard: only the service-role key (sent by pg_net trigger) may call
  // this function. Without this check any logged-in user could POST a
  // fabricated event and trigger spurious emails.
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const bearer = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (bearer !== SERVICE_ROLE_KEY) {
    return json({ error: "unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const delivery_request_id: string | undefined = body?.delivery_request_id;
  const event: string | undefined = body?.event;

  if (!delivery_request_id || !event) {
    return json({ error: "missing delivery_request_id or event" }, 400);
  }
  if (!VALID_EVENTS.includes(event as DeliveryEvent)) {
    return json({ error: `invalid event: ${event}` }, 400);
  }
  const deliveryEvent = event as DeliveryEvent;

  // Service-role client — this is invoked from pg_net, not a user
  // session, so there is no caller auth header to forward.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: request, error: requestErr } = await supabase
    .from("delivery_requests")
    .select(
      "order_number, pickup_address, dropoff_address, package_size, max_price_cents, accepted_price_cents, sender_id, courier_id, pickup_pin",
    )
    .eq("id", delivery_request_id)
    .single();

  if (requestErr || !request) {
    console.error(`send-notification: delivery request not found: ${delivery_request_id}`, requestErr);
    return json({ ok: false, error: "delivery request not found" }, 200);
  }

  const priceCents = request.accepted_price_cents ?? request.max_price_cents ?? null;

  const [senderInfo, courierInfo] = await Promise.all([
    lookupPerson(supabase, request.sender_id, "Your sender"),
    request.courier_id ? lookupPerson(supabase, request.courier_id, "Your courier") : Promise.resolve(null),
  ]);

  const results: Record<string, { ok: boolean; error?: string }> = {};

  // Sender always gets notified, for every event.
  if (senderInfo) {
    results.sender = await sendDeliveryEmail(deliveryEvent, {
      orderNumber: request.order_number,
      pickupAddress: request.pickup_address,
      dropoffAddress: request.dropoff_address,
      priceCents,
      packageSize: request.package_size,
      pickupPin: request.pickup_pin ?? null,
      recipient: {
        email: senderInfo.email,
        firstName: senderInfo.firstName,
        role: "sender",
      },
      counterparty: courierInfo ? { firstName: courierInfo.firstName } : null,
    });
  } else {
    console.error(`send-notification: sender profile/email not found for ${request.sender_id}`);
    results.sender = { ok: false, error: "sender not found" };
  }

  // Courier gets notified for every event except "created" (no courier
  // is assigned yet when a request is first created).
  if (courierInfo && deliveryEvent !== "created") {
    results.courier = await sendDeliveryEmail(deliveryEvent, {
      orderNumber: request.order_number,
      pickupAddress: request.pickup_address,
      dropoffAddress: request.dropoff_address,
      priceCents,
      packageSize: request.package_size,
      recipient: {
        email: courierInfo.email,
        firstName: courierInfo.firstName,
        role: "courier",
      },
      counterparty: senderInfo ? { firstName: senderInfo.firstName } : null,
    });
  }

  console.log(`send-notification: ${deliveryEvent} for ${delivery_request_id}`, results);

  return json({ ok: true, results }, 200);
});

async function lookupPerson(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  fallbackName: string,
): Promise<{ email: string; firstName: string } | null> {
  const [{ data: profile }, { data: userData, error: userErr }] = await Promise.all([
    supabase.from("profiles").select("first_name").eq("id", userId).single(),
    supabase.auth.admin.getUserById(userId),
  ]);

  const email = userData?.user?.email;
  if (userErr || !email) {
    console.error(`send-notification: could not resolve auth email for ${userId}`, userErr);
    return null;
  }

  return {
    email,
    firstName: profile?.first_name ?? fallbackName,
  };
}
