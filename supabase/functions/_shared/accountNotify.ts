// Account-level notifications — background check and payout status.
//
// Distinct from _shared/email.ts and _shared/sms.ts, which are both shaped
// around a delivery (order number, pickup/dropoff, PIN). These events belong
// to the courier's account, not to any one delivery, so they need their own
// copy and their own email shell.
//
// Channel discipline: email on every event, push on every event, SMS only
// where missing the message costs the courier money. Texting someone for
// every status nudge burns A2P goodwill and trains people to ignore us.
//
// Fire-and-forget, same as the other notification modules: never throws,
// logs failures so a Resend/Twilio outage can't break a webhook.

import { sendSmsBodyToUser } from "./sms.ts";
import { sendPushToUsers } from "./fcm.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS = "Spetza <notifications@spetza.com>";
const APP_URL = "https://spetza.com";

export type AccountEvent =
  | "bgcheck_clear"
  | "bgcheck_consider"
  | "bgcheck_rejected"
  | "bgcheck_expired"
  | "payouts_enabled"
  | "payouts_action_needed"
  | "payouts_disabled";

type Tone = "good" | "warn" | "bad";

interface Copy {
  subject: string;
  heading: string;
  /** Email body. Plain sentences; `{name}` is replaced with the first name. */
  body: string;
  cta: { label: string; path: string } | null;
  tone: Tone;
  push: { title: string; body: string };
  /** Present only for events worth a text message. */
  sms: string | null;
}

const COPY: Record<AccountEvent, Copy> = {
  bgcheck_clear: {
    subject: "You're approved to deliver on Spetza",
    heading: "You're approved",
    body:
      "Your background check came back clear, {name}. You can start accepting " +
      "deliveries right now — open Spetza and check the Discover tab for " +
      "requests near you.",
    cta: { label: "Find deliveries", path: "/courier" },
    tone: "good",
    push: {
      title: "You're approved!",
      body: "Your background check cleared. You can now accept deliveries.",
    },
    sms: "✅ Spetza — You're approved! Your background check cleared and you can start accepting deliveries: https://spetza.com/courier",
  },

  bgcheck_consider: {
    subject: "Your background check needs a review",
    heading: "Under review",
    body:
      "Checkr surfaced something on your background check that needs a human " +
      "decision, {name}. Our team reviews these within 2 business days and " +
      "we'll email you as soon as there's an answer. You don't need to do " +
      "anything right now.",
    cta: null,
    tone: "warn",
    push: {
      title: "Background check update",
      body: "Your background check needs review. We'll be in touch.",
    },
    sms: null, // no action for them to take — email is enough
  },

  bgcheck_rejected: {
    subject: "Your Spetza application wasn't approved",
    heading: "Not approved",
    body:
      "We weren't able to approve your courier application, {name}. Checkr " +
      "has emailed you the details of the report directly — federal law " +
      "requires that they, not us, send you that information. If you believe " +
      "the report is inaccurate, you have the right to dispute it with " +
      "Checkr. You're also welcome to reach out to us at contact@spetza.com.",
    cta: null,
    tone: "bad",
    push: {
      title: "Application update",
      body: "Your background check was not approved. Check your email.",
    },
    sms: null, // bad news delivered by text is a bad experience; FCRA notice comes from Checkr
  },

  bgcheck_expired: {
    subject: "Your background check invitation expired",
    heading: "Invitation expired",
    body:
      "You didn't finish your background check in time, {name}, so the " +
      "invitation expired. No charge — you can start a new one whenever " +
      "you're ready.",
    cta: { label: "Start a new check", path: "/courier/verify" },
    tone: "warn",
    push: {
      title: "Background check expired",
      body: "Your invitation expired. Tap to start a new one.",
    },
    sms: null,
  },

  payouts_enabled: {
    subject: "Your Spetza payouts are set up",
    heading: "Payouts are live",
    body:
      "Stripe finished verifying your account, {name}. Earnings from " +
      "completed deliveries will land in your bank the next business day, " +
      "and tips arrive instantly.",
    cta: { label: "View your profile", path: "/courier/profile" },
    tone: "good",
    push: {
      title: "Payouts are set up",
      body: "Stripe verified your account. You'll be paid the next business day.",
    },
    sms: null, // good news, not urgent
  },

  payouts_action_needed: {
    subject: "Stripe needs more information to keep your payouts active",
    heading: "Action needed",
    body:
      "Stripe needs a bit more information before it can keep paying you, " +
      "{name}. This is usually an ID document or a detail that needs " +
      "confirming. It only takes a couple of minutes, and your payouts stay " +
      "active as long as you handle it soon.",
    cta: { label: "Update your details", path: "/courier/profile" },
    tone: "warn",
    push: {
      title: "Stripe needs more info",
      body: "Update your payout details to avoid interruption.",
    },
    sms: null, // warning, not yet blocking — email + push is proportionate
  },

  payouts_disabled: {
    subject: "Your Spetza payouts are paused",
    heading: "Payouts paused",
    body:
      "Stripe has paused payouts on your account, {name}. You won't be paid " +
      "for completed deliveries until this is resolved. Open your profile to " +
      "see what Stripe needs — it's usually a document or a verification step.",
    cta: { label: "Fix your payouts", path: "/courier/profile" },
    tone: "bad",
    push: {
      title: "Your payouts are paused",
      body: "Stripe paused payouts on your account. Tap to fix it.",
    },
    // Money is actively on the line — this one earns a text.
    sms: "⚠️ Spetza — Your payouts are paused and you won't be paid for deliveries until it's fixed: https://spetza.com/courier/profile",
  },
};

const TONE_COLOR: Record<Tone, string> = {
  good: "#76BF6B",
  warn: "#d48b1a",
  bad: "#c0392b",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml(copy: Copy, firstName: string): string {
  const message = escapeHtml(copy.body.replace(/\{name\}/g, firstName));
  const accent = TONE_COLOR[copy.tone];

  const ctaBlock = copy.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
         <tr>
           <td style="background-color:#0378A6; border-radius:8px;">
             <a href="${APP_URL}${copy.cta.path}"
                style="display:inline-block; padding:12px 24px; color:#ffffff; font-size:15px; font-weight:700; text-decoration:none;">
               ${escapeHtml(copy.cta.label)}
             </a>
           </td>
         </tr>
       </table>`
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
              <td style="height:4px; background-color:${accent};"></td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="color:#1a1a2e; font-size:20px; font-weight:800; margin:0 0 16px;">
                  ${escapeHtml(copy.heading)}
                </h1>
                <p style="color:#1a1a2e; font-size:16px; line-height:1.6; margin:0;">
                  ${message}
                </p>
                ${ctaBlock}
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

async function sendEmail(
  to: string,
  copy: Copy,
  firstName: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.warn(`accountNotify: RESEND_API_KEY not set; email not sent`);
    return { ok: false, error: "RESEND_API_KEY not set" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to,
        subject: copy.subject,
        html: renderHtml(copy, firstName),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Resend responded ${res.status}: ${text}`);
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("accountNotify: email failed:", message);
    return { ok: false, error: message };
  }
}

/**
 * Notify a user about an account-level change across every channel that
 * applies to the event. Resolves the recipient's email and first name
 * internally so callers only need the user id.
 *
 * Never throws — a notification failure must not roll back the webhook
 * that triggered it.
 */
export async function notifyAccount(
  supabase: any,
  userId: string,
  event: AccountEvent,
): Promise<{ email: boolean; sms: boolean; push: boolean }> {
  const copy = COPY[event];
  if (!copy) {
    console.error(`accountNotify: unknown event ${event}`);
    return { email: false, sms: false, push: false };
  }

  const result = { email: false, sms: false, push: false };

  const [{ data: profile }, { data: userData }] = await Promise.all([
    supabase.from("profiles").select("first_name").eq("id", userId).single(),
    supabase.auth.admin.getUserById(userId),
  ]);

  const firstName = profile?.first_name ?? "there";
  const email = userData?.user?.email ?? null;

  if (email) {
    const r = await sendEmail(email, copy, firstName);
    result.email = r.ok;
  } else {
    console.error(`accountNotify: no email on file for ${userId}`);
  }

  if (copy.sms) {
    const r = await sendSmsBodyToUser(supabase, userId, copy.sms);
    result.sms = r.sent;
  }

  const p = await sendPushToUsers(supabase, [userId], {
    title: copy.push.title,
    body: copy.push.body,
    data: {
      event,
      deep_link: copy.cta?.path ?? "/courier/profile",
    },
  });
  result.push = !!p;

  console.log(
    `accountNotify: ${event} for ${userId} -> ` +
      `email=${result.email} sms=${result.sms} push=${result.push}`,
  );

  return result;
}
