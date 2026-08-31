// Plain internal alert email, for things an operator has to act on.
//
// Deliberately separate from email.ts: that renders branded, customer-facing
// delivery notifications with a subject matrix per event and role. This is
// the opposite -- unstyled, one recipient, and written to be read in a hurry
// on a phone. Same discipline though: never throws, so a mail outage can
// never take down the webhook that called it.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS = "Spetza Alerts <notifications@spetza.com>";

// Overridable so the address can move without a redeploy.
const TO_ADDRESS = Deno.env.get("OPERATOR_ALERT_EMAIL") || "contact@12sigma.com";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Send an operator alert. Rows render as a simple label/value list.
 *
 * Returns true if Resend accepted it, false otherwise — callers may want to
 * log the difference, but none of them should change behaviour because of it.
 */
export async function sendOperatorAlert(
  subject: string,
  lead: string,
  rows: Array<[string, string]>,
  actionUrl?: string,
): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.error("operatorAlert: RESEND_API_KEY missing, dropping:", subject);
    return false;
  }

  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr>` +
        `<td style="padding:4px 16px 4px 0;color:#67808b;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>` +
        `<td style="padding:4px 0;color:#12242b"><strong>${escapeHtml(value)}</strong></td>` +
        `</tr>`,
    )
    .join("");

  const html =
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#12242b">` +
    `<p style="margin:0 0 16px">${escapeHtml(lead)}</p>` +
    `<table style="border-collapse:collapse;margin:0 0 16px">${rowsHtml}</table>` +
    (actionUrl
      ? `<p style="margin:0"><a href="${escapeHtml(actionUrl)}" style="color:#0378a6">Open in Stripe</a></p>`
      : "") +
    `</div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: TO_ADDRESS,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      console.error(`operatorAlert: Resend ${res.status}`, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("operatorAlert: send threw", e);
    return false;
  }
}

/** Cents to "$12.34", for alert bodies. */
export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
