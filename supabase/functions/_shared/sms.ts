// Twilio SMS sender for delivery lifecycle notifications.
// Same fire-and-forget pattern as email.ts and fcm.ts: never throws,
// logs failures so an SMS outage never blocks the delivery operation.

const TWILIO_ACCOUNT_SID = () => Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = () => Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE_NUMBER = () => Deno.env.get("TWILIO_PHONE_NUMBER");

export type SmsEvent =
  | "created"
  | "accepted"
  | "arrived"
  | "picked_up"
  | "delivered"
  | "cancelled";

export type SmsRole = "sender" | "courier";

// SMS copy — shorter than email, conversational.
// {name} = counterparty's first name.
// {order} = order number.
// {price} = formatted price.
// {pickup} = pickup address.
// {pin} = 4-digit pickup PIN.
const SMS_TEMPLATES: Record<SmsEvent, Record<SmsRole, string>> = {
  created: {
    sender:
      "📦 {order} — Your delivery request is live! Couriers near you can see it now. We'll text you when someone accepts.",
    courier:
      "📦 New delivery near you — {price} · {pickup}\n\nOpen Spetza to accept: https://spetza.com/#/courier",
  },
  accepted: {
    sender:
      "✅ {order} — {name} accepted your delivery and is heading to pick up.\n\nYour pickup code: {pin}\nShare this code with your courier.",
    courier:
      "✅ {order} — You accepted a delivery. Head to the pickup to collect from {name}.\n\nhttps://spetza.com/#/courier/deliveries/{id}",
  },
  arrived: {
    sender:
      "🚗 {order} — {name} is at pickup. Share your 4-digit code now: {pin}",
    courier: "", // no SMS to the courier — they just tapped 'I have arrived' themselves
  },
  picked_up: {
    sender: "🚗 {order} — {name} picked up your package and is on the way to the dropoff.",
    courier: "🚗 {order} — Package picked up. Head to the dropoff to complete delivery.",
  },
  delivered: {
    sender: "🎉 {order} — Your package has been delivered by {name}. Thanks for using Spetza!",
    courier: "💰 {order} — Delivery complete! {price} earned. Payout hits your bank next business day.",
  },
  cancelled: {
    sender: "❌ {order} — Your delivery has been cancelled. Any payment hold has been released.",
    courier: "❌ {order} — This delivery was cancelled. No further action needed.",
  },
};

interface SmsContext {
  event: SmsEvent;
  role: SmsRole;
  orderNumber: string;
  deliveryRequestId: string;
  pickupAddress?: string;
  priceCents?: number | null;
  pickupPin?: string | null;
  counterpartyName?: string | null;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function buildSmsBody(ctx: SmsContext): string | null {
  const template = SMS_TEMPLATES[ctx.event]?.[ctx.role];
  if (!template) return null;

  return template
    .replace(/\{name\}/g, ctx.counterpartyName ?? "your counterparty")
    .replace(/\{order\}/g, ctx.orderNumber)
    .replace(/\{price\}/g, ctx.priceCents ? formatPrice(ctx.priceCents) : "")
    .replace(/\{pickup\}/g, ctx.pickupAddress ?? "")
    .replace(/\{pin\}/g, ctx.pickupPin ?? "----")
    .replace(/\{id\}/g, ctx.deliveryRequestId);
}

// Send a single SMS via Twilio REST API.
// Returns { ok, error? }. Never throws.
async function sendSms(
  to: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const sid = TWILIO_ACCOUNT_SID();
  const token = TWILIO_AUTH_TOKEN();
  const from = TWILIO_PHONE_NUMBER();

  if (!sid || !token || !from) {
    console.warn("SMS: Twilio credentials not set; SMS not sent");
    return { ok: false, error: "Twilio credentials not configured" };
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      console.error(`SMS: Twilio error ${res.status}: ${text}`);
      return { ok: false, error: `Twilio ${res.status}` };
    }

    const data = await res.json();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("SMS: send error:", message);
    return { ok: false, error: message };
  }
}

// Send an SMS to a single user by looking up their phone number.
// Checks sms_notifications_enabled and phone_verified_at.
export async function sendSmsToUser(
  supabase: any,
  userId: string,
  ctx: SmsContext,
): Promise<{ ok: boolean; sent: boolean; error?: string }> {
  const body = buildSmsBody(ctx);
  if (!body) return { ok: true, sent: false }; // no template for this event/role
  return sendSmsBodyToUser(supabase, userId, body);
}

// Send an arbitrary SMS body to a user, applying the same consent rules
// as sendSmsToUser (verified phone + not opted out). Exists so account-level
// notifications (background check, payout status) can reuse the opt-in
// logic without inheriting the delivery-shaped SmsContext.
export async function sendSmsBodyToUser(
  supabase: any,
  userId: string,
  body: string,
): Promise<{ ok: boolean; sent: boolean; error?: string }> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("phone_number, phone_verified_at, sms_notifications_enabled")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    console.error(`SMS: profile lookup failed for ${userId}`, error);
    return { ok: false, sent: false, error: "profile not found" };
  }

  if (!profile.phone_number || !profile.phone_verified_at) {
    return { ok: true, sent: false }; // no verified phone — skip silently
  }

  if (profile.sms_notifications_enabled === false) {
    return { ok: true, sent: false }; // user opted out
  }

  const result = await sendSms(profile.phone_number, body);
  return { ok: result.ok, sent: result.ok, error: result.error };
}

// Fan-out: send SMS to multiple courier user IDs (for "new delivery near you").
// Looks up phone numbers in bulk, skips users without verified phones.
export async function sendSmsToCouriers(
  supabase: any,
  courierIds: string[],
  ctx: SmsContext,
): Promise<{ sent: number; failed: number; skipped: number }> {
  if (courierIds.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  const body = buildSmsBody(ctx);
  if (!body) return { sent: 0, failed: 0, skipped: 0 };

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, phone_number, phone_verified_at, sms_notifications_enabled")
    .in("id", courierIds);

  if (error || !profiles) {
    console.error("SMS: bulk profile lookup failed:", error);
    return { sent: 0, failed: courierIds.length, skipped: 0 };
  }

  const eligible = profiles.filter(
    (p: any) =>
      p.phone_number &&
      p.phone_verified_at &&
      p.sms_notifications_enabled !== false,
  );

  const results = await Promise.allSettled(
    eligible.map((p: any) => sendSms(p.phone_number, body)),
  );

  let sent = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.ok) sent++;
    else failed++;
  }

  return { sent, failed, skipped: courierIds.length - eligible.length };
}
