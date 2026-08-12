// Branded transactional email renderer + Resend sender for delivery
// lifecycle notifications. Mirrors the pattern in analytics.ts: never
// throws, logs and swallows failures so an email outage never blocks
// the delivery operation that triggered it.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS = "Spetza <notifications@spetza.com>";

export type DeliveryEvent =
  | "created"
  | "accepted"
  | "picked_up"
  | "delivered"
  | "cancelled";

export type Role = "sender" | "courier";

// The person receiving this email.
export interface RecipientContext {
  email: string;
  firstName: string;
  role: Role;
}

// The other party involved in the delivery (may be absent, e.g. no
// courier assigned yet at "created" time).
export interface CounterpartyContext {
  firstName: string;
}

export interface DeliveryContext {
  orderNumber: string;
  pickupAddress: string;
  dropoffAddress: string;
  priceCents?: number | null;
  packageSize?: string | null;
  pickupPin?: string | null;
  recipient: RecipientContext;
  counterparty?: CounterpartyContext | null;
}

// Subject lines for every event × role combination. An empty string
// means that role does not get an email for that event (e.g. couriers
// aren't notified when a request is first created).
const SUBJECTS: Record<DeliveryEvent, Record<Role, string>> = {
  created: {
    sender: "Your delivery request is live",
    courier: "",
  },
  accepted: {
    sender: "A courier accepted your delivery",
    courier: "You accepted a delivery",
  },
  picked_up: {
    sender: "Your package has been picked up",
    courier: "Picked up, en route to dropoff",
  },
  delivered: {
    sender: "Your package has been delivered",
    courier: "Delivery complete, earnings on the way",
  },
  cancelled: {
    sender: "Your delivery was cancelled",
    courier: "The delivery was cancelled",
  },
};

// Body copy templates. `{name}` is replaced with the counterparty's
// first name, bolded. Templates that don't reference a counterparty
// (e.g. "created") simply ignore it.
const BODIES: Record<DeliveryEvent, Record<Role, string>> = {
  created: {
    sender:
      "Your delivery request is now live and visible to couriers in your area. We'll email you as soon as someone accepts it.",
    courier: "",
  },
  accepted: {
    sender: "Great news — {name} has accepted your delivery and is heading to the pickup location.",
    courier: "You've accepted this delivery. Head to the pickup address to collect the package from {name}.",
  },
  picked_up: {
    sender: "{name} has picked up your package and is on the way to the dropoff.",
    courier: "Package picked up from {name}. Head to the dropoff address to complete the delivery.",
  },
  delivered: {
    sender: "Your package has been delivered by {name}. Thank you for using Spetza!",
    courier: "Delivery complete! Your earnings for this delivery are on the way to your account.",
  },
  cancelled: {
    sender: "This delivery has been cancelled. If payment was authorized, it has been released.",
    courier: "This delivery has been cancelled by the sender. No further action is needed.",
  },
};

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function subjectFor(event: DeliveryEvent, role: Role, orderNumber: string): string {
  const text = SUBJECTS[event][role];
  if (!text) return "";
  return `${orderNumber} — ${text}`;
}

export function renderHtml(event: DeliveryEvent, ctx: DeliveryContext): string {
  const role = ctx.recipient.role;
  const bodyTemplate = BODIES[event][role];
  const counterpartyName = ctx.counterparty?.firstName ?? "";
  const message = bodyTemplate.replace(
    "{name}",
    `<strong>${escapeHtml(counterpartyName)}</strong>`,
  );

  const rows: string[] = [];
  rows.push(detailRow("Pickup", escapeHtml(ctx.pickupAddress)));
  rows.push(detailRow("Dropoff", escapeHtml(ctx.dropoffAddress)));
  if (ctx.priceCents != null) {
    rows.push(detailRow("Price", formatPrice(ctx.priceCents)));
  }
  if (ctx.packageSize) {
    rows.push(detailRow("Size", escapeHtml(ctx.packageSize)));
  }

  // Show the pickup PIN prominently to the sender on "accepted"
  const pinBlock =
    event === "accepted" && role === "sender" && ctx.pickupPin
      ? `<div style="margin:24px 0; padding:20px; background-color:#0378A6; border-radius:8px; text-align:center;">
           <div style="color:#ffffff; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:2px; margin-bottom:8px;">Pickup Code</div>
           <div style="color:#ffffff; font-size:36px; font-weight:900; letter-spacing:0.3em;">${escapeHtml(ctx.pickupPin)}</div>
           <div style="color:#ffffff; font-size:13px; margin-top:8px; opacity:0.85;">Share this code with your courier at pickup</div>
         </div>`
      : "";

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0; padding:0; background-color:#F2F2F2; font-family: 'Nunito', Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F2F2F2; padding: 32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; max-width:480px; width:100%;">
            <tr>
              <td style="background-color:#0378A6; padding:24px 32px;">
                <span style="color:#ffffff; font-size:22px; font-weight:800; letter-spacing:0.5px;">Spetza</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <span style="display:inline-block; background-color:#0378A6; color:#ffffff; font-size:13px; font-weight:700; padding:4px 12px; border-radius:999px; margin-bottom:16px;">
                  ${escapeHtml(ctx.orderNumber)}
                </span>
                <p style="color:#1a1a2e; font-size:16px; line-height:1.6; margin:16px 0 24px;">
                  ${message}
                </p>
                ${pinBlock}
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8ec; border-radius:8px; overflow:hidden;">
                  ${rows.join("\n")}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px; border-top:1px solid #e2e8ec;">
                <p style="color:#5b6573; font-size:12px; margin:0; line-height:1.5;">
                  © 2026 12 Sigma LLC · Spetza is a DBA of 12 Sigma LLC
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();
}

function detailRow(label: string, value: string): string {
  return `
                  <tr>
                    <td style="padding:12px 16px; background-color:#F2F2F2; color:#5b6573; font-size:13px; font-weight:700; width:35%; border-bottom:1px solid #e2e8ec;">${label}</td>
                    <td style="padding:12px 16px; color:#1a1a2e; font-size:14px; border-bottom:1px solid #e2e8ec;">${value}</td>
                  </tr>`;
}

export async function sendDeliveryEmail(
  event: DeliveryEvent,
  ctx: DeliveryContext,
): Promise<{ ok: boolean; error?: string }> {
  const subject = subjectFor(event, ctx.recipient.role, ctx.orderNumber);

  // No subject text means this role doesn't get an email for this
  // event (e.g. courier on "created"). Skip silently — not an error.
  if (subject === "") {
    return { ok: true };
  }

  if (!RESEND_API_KEY) {
    console.warn(`RESEND_API_KEY not set; email for ${event}/${ctx.recipient.role} not sent`);
    return { ok: false, error: "RESEND_API_KEY not set" };
  }

  try {
    const html = renderHtml(event, ctx);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: ctx.recipient.email,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Resend responded ${res.status}: ${text}`);
    }

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to send ${event}/${ctx.recipient.role} email:`, message);
    return { ok: false, error: message };
  }
}

// Push notification copy — shorter than email subjects.
// Used by send-notification to build FCM push messages.
export const PUSH_TITLES: Record<DeliveryEvent, Record<Role, string>> = {
  created: {
    sender: "Your delivery is live",
    courier: "New delivery near you",
  },
  accepted: {
    sender: "Courier accepted your delivery",
    courier: "You accepted a delivery",
  },
  picked_up: {
    sender: "Package picked up",
    courier: "Package picked up — en route",
  },
  delivered: {
    sender: "Package delivered!",
    courier: "Delivery complete!",
  },
  cancelled: {
    sender: "Delivery cancelled",
    courier: "Delivery cancelled",
  },
};

export const PUSH_BODIES: Record<DeliveryEvent, Record<Role, string>> = {
  created: {
    sender: "Couriers near you can see it now.",
    courier: "", // filled dynamically with distance + price
  },
  accepted: {
    sender: "{name} is heading to pick up your package.",
    courier: "Head to the pickup to collect from {name}.",
  },
  picked_up: {
    sender: "{name} is on the way to the dropoff.",
    courier: "Head to the dropoff to complete delivery.",
  },
  delivered: {
    sender: "Delivered by {name}. Thank you for using Spetza!",
    courier: "Earnings on the way to your account.",
  },
  cancelled: {
    sender: "Payment hold has been released.",
    courier: "No further action needed.",
  },
};
