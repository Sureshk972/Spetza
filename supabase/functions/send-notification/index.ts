import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  sendDeliveryEmail,
  PUSH_TITLES,
  PUSH_BODIES,
  type DeliveryEvent,
} from "../_shared/email.ts";
import { sendPushToUsers, type PushMessage } from "../_shared/fcm.ts";
import { sendSmsToUser, sendSmsToCouriers, type SmsEvent } from "../_shared/sms.ts";

const VALID_EVENTS: DeliveryEvent[] = [
  "created",
  "accepted",
  "arrived",
  "picked_up",
  "delivered",
  "cancelled",
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function pushBody(template: string, counterpartyName: string | null): string {
  return template.replace("{name}", counterpartyName ?? "your counterparty");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: request, error: requestErr } = await supabase
    .from("delivery_requests")
    .select(
      "order_number, pickup_address, dropoff_address, pickup_lat, pickup_lng, package_size, max_price_cents, accepted_price_cents, sender_id, courier_id",
    )
    .eq("id", delivery_request_id)
    .single();

  if (requestErr || !request) {
    console.error(`send-notification: delivery request not found: ${delivery_request_id}`, requestErr);
    return json({ ok: false, error: "delivery request not found" }, 200);
  }

  const priceCents = request.accepted_price_cents ?? request.max_price_cents ?? null;

  const { data: pinRow } = await supabase
    .from("delivery_pins")
    .select("pin")
    .eq("delivery_request_id", delivery_request_id)
    .maybeSingle();
  const pickupPin: string | null = pinRow?.pin ?? null;

  const [senderInfo, courierInfo] = await Promise.all([
    lookupPerson(supabase, request.sender_id, "Your sender"),
    request.courier_id ? lookupPerson(supabase, request.courier_id, "Your courier") : Promise.resolve(null),
  ]);

  const results: Record<string, unknown> = {};

  // ── EMAIL (existing) ──────────────────────────────────────────────

  if (senderInfo) {
    results.senderEmail = await sendDeliveryEmail(deliveryEvent, {
      orderNumber: request.order_number,
      pickupAddress: request.pickup_address,
      dropoffAddress: request.dropoff_address,
      priceCents,
      packageSize: request.package_size,
      pickupPin,
      recipient: {
        email: senderInfo.email,
        firstName: senderInfo.firstName,
        role: "sender",
      },
      counterparty: courierInfo ? { firstName: courierInfo.firstName } : null,
    });
  } else {
    console.error(`send-notification: sender profile/email not found for ${request.sender_id}`);
    results.senderEmail = { ok: false, error: "sender not found" };
  }

  if (courierInfo && deliveryEvent !== "created") {
    results.courierEmail = await sendDeliveryEmail(deliveryEvent, {
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

  // ── PUSH NOTIFICATIONS (new) ──────────────────────────────────────

  // Sender push (all events)
  if (senderInfo) {
    const title = PUSH_TITLES[deliveryEvent].sender;
    const bodyText = pushBody(PUSH_BODIES[deliveryEvent].sender, courierInfo?.firstName ?? null);
    if (title) {
      results.senderPush = await sendPushToUsers(supabase, [request.sender_id], {
        title: `${request.order_number} — ${title}`,
        body: bodyText,
        data: {
          event: deliveryEvent,
          delivery_request_id,
          deep_link: `/sender/requests/${delivery_request_id}`,
        },
      });
    }
  }

  // Courier push (all events except "created" for the assigned courier)
  if (courierInfo && deliveryEvent !== "created" && request.courier_id) {
    const title = PUSH_TITLES[deliveryEvent].courier;
    const bodyText = pushBody(PUSH_BODIES[deliveryEvent].courier, senderInfo?.firstName ?? null);
    if (title) {
      const pushMsg: PushMessage = {
        title: `${request.order_number} — ${title}`,
        body: bodyText,
        data: {
          event: deliveryEvent,
          delivery_request_id,
          deep_link: `/courier/deliveries/${delivery_request_id}`,
        },
      };
      // On "delivered", add earnings to the body
      if (deliveryEvent === "delivered" && priceCents != null) {
        pushMsg.body = `${formatPrice(priceCents)} earned. Payout on the way.`;
      }
      results.courierPush = await sendPushToUsers(supabase, [request.courier_id], pushMsg);
    }
  }

  // Fan-out: "new order near you" push + SMS to nearby couriers on "created"
  let nearbyCourierIds: string[] = [];
  if (deliveryEvent === "created" && request.pickup_lat && request.pickup_lng) {
    const { data: nearbyCouriers } = await supabase.rpc("nearby_couriers_for_push", {
      p_pickup_lat: request.pickup_lat,
      p_pickup_lng: request.pickup_lng,
    });

    if (nearbyCouriers && nearbyCouriers.length > 0) {
      nearbyCourierIds = nearbyCouriers.map((c: { id: string }) => c.id);
      const priceStr = priceCents ? formatPrice(priceCents) : "";
      results.fanoutPush = await sendPushToUsers(supabase, nearbyCourierIds, {
        title: "New delivery near you",
        body: priceStr
          ? `${priceStr} · ${request.pickup_address}`
          : request.pickup_address,
        data: {
          event: "created",
          delivery_request_id,
          deep_link: "/courier",
        },
      });
    }
  }

  // ── SMS NOTIFICATIONS ─────────────────────────────────────────────

  const smsCtx = {
    event: deliveryEvent as SmsEvent,
    orderNumber: request.order_number,
    deliveryRequestId: delivery_request_id,
    pickupAddress: request.pickup_address,
    priceCents,
    pickupPin,
    counterpartyName: null as string | null,
  };

  // Sender SMS (all events)
  if (senderInfo) {
    results.senderSms = await sendSmsToUser(supabase, request.sender_id, {
      ...smsCtx,
      role: "sender",
      counterpartyName: courierInfo?.firstName ?? null,
    });
  }

  // Courier SMS (all events except "created" for the assigned courier)
  if (courierInfo && deliveryEvent !== "created" && request.courier_id) {
    results.courierSms = await sendSmsToUser(supabase, request.courier_id, {
      ...smsCtx,
      role: "courier",
      counterpartyName: senderInfo?.firstName ?? null,
    });
  }

  // Fan-out SMS: "new delivery near you" to nearby couriers on "created"
  if (deliveryEvent === "created" && nearbyCourierIds.length > 0) {
    results.fanoutSms = await sendSmsToCouriers(supabase, nearbyCourierIds, {
      ...smsCtx,
      role: "courier",
    });
  }

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
