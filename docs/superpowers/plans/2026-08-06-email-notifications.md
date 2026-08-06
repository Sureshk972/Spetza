# Email Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send transactional emails via Resend for all delivery lifecycle events (created, accepted, picked up, delivered, cancelled) to both sender and courier, with the order code in every subject line.

**Architecture:** A Postgres trigger on `delivery_requests` fires on INSERT and status-change UPDATEs, calling `pg_net.http_post()` to invoke a `send-notification` edge function. That function looks up profiles + auth emails and calls a shared `_shared/email.ts` utility that renders branded HTML and sends via the Resend API.

**Tech Stack:** Supabase Edge Functions (Deno), Resend HTTP API, pg_net extension, Postgres triggers

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/functions/_shared/email.ts` | HTML email templates + Resend send helper |
| Create | `supabase/functions/send-notification/index.ts` | Edge function: look up delivery + profiles, send emails |
| Create | `supabase/migrations/20260806000002_email_notification_trigger.sql` | pg_net extension, trigger function, trigger |

---

### Task 1: Shared Email Utility (`_shared/email.ts`)

**Files:**
- Create: `supabase/functions/_shared/email.ts`

- [ ] **Step 1: Create the email template renderer and Resend sender**

Create `supabase/functions/_shared/email.ts` with the full content below. This module exports two things: `sendDeliveryEmail()` which sends a single email via Resend, and the template logic that maps event+role to subject/body.

```ts
// supabase/functions/_shared/email.ts
//
// Branded transactional email templates + Resend HTTP sender.
// Called by the send-notification edge function.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = "Spetza <notifications@spetza.com>";

// ── Types ────────────────────────────────────────────────────────────

export interface DeliveryContext {
  order_number: string;          // e.g. "SPZ-00042"
  pickup_address: string;
  dropoff_address: string;
  package_size: string | null;
  price_cents: number;           // max_price_cents or accepted_price_cents
}

export interface RecipientContext {
  email: string;
  first_name: string;
  role: "sender" | "courier";
}

export interface CounterpartyContext {
  first_name: string;
}

export type DeliveryEvent =
  | "created"
  | "accepted"
  | "picked_up"
  | "delivered"
  | "cancelled";

// ── Subject lines ────────────────────────────────────────────────────

const SUBJECTS: Record<DeliveryEvent, Record<"sender" | "courier", string>> = {
  created: {
    sender: "Your delivery request is live",
    courier: "", // courier doesn't get a 'created' email
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

function subjectLine(event: DeliveryEvent, role: "sender" | "courier", orderNumber: string): string {
  return `${orderNumber} — ${SUBJECTS[event][role]}`;
}

// ── Price formatting ─────────────────────────────────────────────────

function fmtPrice(cents: number): string {
  return "$" + (cents / 100).toFixed(2);
}

// ── HTML email template ──────────────────────────────────────────────

function bodyLine(event: DeliveryEvent, role: "sender" | "courier", counterparty: CounterpartyContext | null): string {
  const name = counterparty?.first_name ?? "your counterparty";
  const lines: Record<DeliveryEvent, Record<"sender" | "courier", string>> = {
    created: {
      sender: "Your delivery request is now live and visible to couriers in your area. We'll email you as soon as someone accepts it.",
      courier: "",
    },
    accepted: {
      sender: `Great news — <strong>${name}</strong> has accepted your delivery and is heading to the pickup location.`,
      courier: `You've accepted this delivery. Head to the pickup address to collect the package from <strong>${name}</strong>.`,
    },
    picked_up: {
      sender: `<strong>${name}</strong> has picked up your package and is on the way to the dropoff.`,
      courier: `Package picked up from <strong>${name}</strong>. Head to the dropoff address to complete the delivery.`,
    },
    delivered: {
      sender: `Your package has been delivered by <strong>${name}</strong>. Thank you for using Spetza!`,
      courier: `Delivery complete! Your earnings for this delivery are on the way to your account.`,
    },
    cancelled: {
      sender: "This delivery has been cancelled. If payment was authorized, it has been released.",
      courier: "This delivery has been cancelled by the sender. No further action is needed.",
    },
  };
  return lines[event][role];
}

function renderHtml(
  event: DeliveryEvent,
  role: "sender" | "courier",
  delivery: DeliveryContext,
  counterparty: CounterpartyContext | null,
): string {
  const message = bodyLine(event, role, counterparty);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F2F2F2;font-family:'Nunito',Helvetica,Arial,sans-serif;color:#1a1a2e">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F2F2;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
        <!-- Header -->
        <tr><td style="background:#0378A6;padding:24px 32px">
          <span style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:0.5px">Spetza</span>
        </td></tr>
        <!-- Order badge -->
        <tr><td style="padding:24px 32px 0">
          <span style="display:inline-block;background:#0378A6;color:#ffffff;font-size:13px;font-weight:700;padding:4px 12px;border-radius:6px;letter-spacing:0.5px">${delivery.order_number}</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:16px 32px 0">
          <p style="font-size:16px;line-height:1.6;margin:0">${message}</p>
        </td></tr>
        <!-- Details -->
        <tr><td style="padding:20px 32px">
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#5b6573">
            <tr><td style="padding:6px 0;font-weight:700;color:#1a1a2e;width:100px">Pickup</td><td style="padding:6px 0">${delivery.pickup_address}</td></tr>
            <tr><td style="padding:6px 0;font-weight:700;color:#1a1a2e">Dropoff</td><td style="padding:6px 0">${delivery.dropoff_address}</td></tr>
            <tr><td style="padding:6px 0;font-weight:700;color:#1a1a2e">Price</td><td style="padding:6px 0">${fmtPrice(delivery.price_cents)}</td></tr>
            ${delivery.package_size ? `<tr><td style="padding:6px 0;font-weight:700;color:#1a1a2e">Size</td><td style="padding:6px 0">${delivery.package_size}</td></tr>` : ""}
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #e2e8ec">
          <p style="font-size:12px;color:#5b6573;margin:0">&copy; 2026 12 Sigma LLC &middot; Spetza is a DBA of 12 Sigma LLC</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Resend API ────────────────────────────────────────────────────────

export async function sendDeliveryEmail(
  event: DeliveryEvent,
  delivery: DeliveryContext,
  recipient: RecipientContext,
  counterparty: CounterpartyContext | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set; skipping email");
    return { ok: false, error: "RESEND_API_KEY not set" };
  }

  const subject = subjectLine(event, recipient.role, delivery.order_number);
  if (!subject.includes("—")) {
    // Safety: no subject text means this event+role combo shouldn't send
    return { ok: true };
  }

  const html = renderHtml(event, recipient.role, delivery, counterparty);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [recipient.email],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Resend ${res.status}: ${text}`);
      return { ok: false, error: `Resend ${res.status}: ${text}` };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Resend send failed:", message);
    return { ok: false, error: message };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/email.ts
git commit -m "feat: add shared email utility with Resend + 9 branded templates"
```

---

### Task 2: Send-Notification Edge Function

**Files:**
- Create: `supabase/functions/send-notification/index.ts`

- [ ] **Step 1: Create the edge function**

Create `supabase/functions/send-notification/index.ts` with the full content below. This function receives `{ delivery_request_id, event }` from the Postgres trigger via pg_net, looks up the delivery + sender + courier profiles and auth emails, then calls `sendDeliveryEmail()` for each applicable recipient.

```ts
// supabase/functions/send-notification/index.ts
//
// Called by the delivery_requests_notify Postgres trigger via pg_net.
// Input: { delivery_request_id: uuid, event: string }
// Auth: service-role only (the trigger passes the service-role key).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  sendDeliveryEmail,
  type DeliveryContext,
  type DeliveryEvent,
  type RecipientContext,
  type CounterpartyContext,
} from "../_shared/email.ts";

const VALID_EVENTS = new Set<DeliveryEvent>([
  "created",
  "accepted",
  "picked_up",
  "delivered",
  "cancelled",
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  // pg_net sends POST; nothing else should call this.
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: { delivery_request_id?: string; event?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const { delivery_request_id, event } = body;
  if (!delivery_request_id || !event) {
    return json({ error: "missing delivery_request_id or event" }, 400);
  }
  if (!VALID_EVENTS.has(event as DeliveryEvent)) {
    return json({ error: `unknown event: ${event}` }, 400);
  }
  const deliveryEvent = event as DeliveryEvent;

  // ── Look up delivery request ─────────────────────────────────────
  const { data: dr, error: drErr } = await supabase
    .from("delivery_requests")
    .select(
      "order_number, pickup_address, dropoff_address, package_size, max_price_cents, accepted_price_cents, sender_id, courier_id",
    )
    .eq("id", delivery_request_id)
    .single();

  if (drErr || !dr) {
    console.error("delivery_request lookup failed:", drErr?.message);
    return json({ error: "delivery_request not found" }, 404);
  }

  const delivery: DeliveryContext = {
    order_number: dr.order_number,
    pickup_address: dr.pickup_address,
    dropoff_address: dr.dropoff_address,
    package_size: dr.package_size,
    price_cents: dr.accepted_price_cents ?? dr.max_price_cents,
  };

  // ── Look up sender profile + auth email ──────────────────────────
  const { data: senderProfile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", dr.sender_id)
    .single();

  const { data: { user: senderUser } } = await supabase.auth.admin.getUserById(dr.sender_id);
  const senderEmail = senderUser?.email;
  const senderName = senderProfile?.first_name || "Sender";

  // ── Look up courier profile + auth email (if assigned) ───────────
  let courierEmail: string | null = null;
  let courierName = "Courier";
  if (dr.courier_id) {
    const { data: courierProfile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", dr.courier_id)
      .single();

    const { data: { user: courierUser } } = await supabase.auth.admin.getUserById(dr.courier_id);
    courierEmail = courierUser?.email ?? null;
    courierName = courierProfile?.first_name || "Courier";
  }

  // ── Send emails ──────────────────────────────────────────────────
  const results: Array<{ to: string; ok: boolean; error?: string }> = [];

  // Sender always gets an email
  if (senderEmail) {
    const recipient: RecipientContext = {
      email: senderEmail,
      first_name: senderName,
      role: "sender",
    };
    const counterparty: CounterpartyContext | null = dr.courier_id
      ? { first_name: courierName }
      : null;
    const result = await sendDeliveryEmail(deliveryEvent, delivery, recipient, counterparty);
    results.push({ to: senderEmail, ...result });
  }

  // Courier gets an email for all events except "created"
  if (deliveryEvent !== "created" && courierEmail) {
    const recipient: RecipientContext = {
      email: courierEmail,
      first_name: courierName,
      role: "courier",
    };
    const counterparty: CounterpartyContext = { first_name: senderName };
    const result = await sendDeliveryEmail(deliveryEvent, delivery, recipient, counterparty);
    results.push({ to: courierEmail, ...result });
  }

  console.log(`[send-notification] ${deliveryEvent} ${dr.order_number}: ${results.length} email(s) sent`);

  // Always return 200 — email failure is non-blocking.
  return json({ event: deliveryEvent, order_number: dr.order_number, results });
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/send-notification/index.ts
git commit -m "feat: add send-notification edge function for delivery emails"
```

---

### Task 3: Postgres Migration (pg_net Trigger)

**Files:**
- Create: `supabase/migrations/20260806000002_email_notification_trigger.sql`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260806000002_email_notification_trigger.sql` with the full content below. This migration:
1. Enables the `pg_net` extension (already available on Supabase, just needs enabling)
2. Creates a trigger function that fires on INSERT or status-change UPDATE
3. Uses `net.http_post()` to call the `send-notification` edge function asynchronously
4. Stores the Supabase URL and service-role key in the function body (they never leave the DB server — this is the standard Supabase pattern for pg_net triggers)

The Supabase project ref is `ggjjoagjurlirdaenttp`. The service-role key must be read from vault or injected. We use the `current_setting()` approach to read `supabase.service_role_key` which is pre-set on Supabase-hosted Postgres.

```sql
-- Enable pg_net for async HTTP from Postgres
create extension if not exists pg_net with schema extensions;

-- Trigger function: fires on INSERT (created) or status-change UPDATE
create or replace function public.notify_delivery_status()
returns trigger
language plpgsql
security definer
as $$
declare
  _event text;
  _url text;
  _service_key text;
  _payload jsonb;
begin
  -- Determine the event
  if TG_OP = 'INSERT' then
    _event := 'created';
  elsif TG_OP = 'UPDATE' and OLD.status is distinct from NEW.status then
    _event := NEW.status::text;
  else
    -- No status change on UPDATE — skip
    return NEW;
  end if;

  -- Only fire for known delivery events
  if _event not in ('created', 'accepted', 'picked_up', 'delivered', 'cancelled') then
    return NEW;
  end if;

  _url := concat(
    current_setting('app.settings.supabase_url', true),
    '/functions/v1/send-notification'
  );
  _service_key := current_setting('app.settings.service_role_key', true);

  -- Fall back to vault secrets if app.settings not available
  if _url is null or _url = '' or _service_key is null or _service_key = '' then
    select decrypted_secret into _url
    from vault.decrypted_secrets
    where name = 'supabase_url'
    limit 1;

    select decrypted_secret into _service_key
    from vault.decrypted_secrets
    where name = 'service_role_key'
    limit 1;

    _url := concat(_url, '/functions/v1/send-notification');
  end if;

  -- If still no URL/key, log and bail
  if _url is null or _service_key is null then
    raise warning 'notify_delivery_status: missing supabase_url or service_role_key';
    return NEW;
  end if;

  _payload := jsonb_build_object(
    'delivery_request_id', NEW.id,
    'event', _event
  );

  -- Async HTTP POST via pg_net — returns immediately
  perform net.http_post(
    url := _url,
    body := _payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', concat('Bearer ', _service_key)
    )
  );

  return NEW;
end;
$$;

-- Attach trigger to delivery_requests
drop trigger if exists delivery_requests_notify on public.delivery_requests;
create trigger delivery_requests_notify
  after insert or update on public.delivery_requests
  for each row
  execute function public.notify_delivery_status();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260806000002_email_notification_trigger.sql
git commit -m "feat: add pg_net trigger for delivery email notifications"
```

---

### Task 4: Deploy & Verify

**Files:**
- No new files — deployment and manual verification

- [ ] **Step 1: Deploy the edge function**

```bash
npx supabase functions deploy send-notification --project-ref ggjjoagjurlirdaenttp
```

Expected: Function deployed successfully.

- [ ] **Step 2: Push the migration**

```bash
npx supabase db push --linked
```

Expected: Migration applied, pg_net extension enabled, trigger created.

- [ ] **Step 3: Verify the trigger exists**

```bash
npx supabase db query --linked "SELECT tgname, tgtype, tgenabled FROM pg_trigger WHERE tgname = 'delivery_requests_notify';"
```

Expected: One row showing the trigger is enabled.

- [ ] **Step 4: Verify the edge function is reachable**

```bash
curl -s -X POST "https://ggjjoagjurlirdaenttp.supabase.co/functions/v1/send-notification" \
  -H "Content-Type: application/json" \
  -d '{}' | head -c 200
```

Expected: `{"error":"missing delivery_request_id or event"}` (proves function is deployed and responding).

- [ ] **Step 5: Final commit with all changes**

```bash
git push origin main
```

---

## Setup Checklist (User Action Required)

Before emails will actually send, the user (Suresh) needs to:

1. **Sign up at [resend.com](https://resend.com)** and get an API key
2. **Verify `spetza.com` domain** in Resend dashboard (add DNS records)
3. **Set the secret:**
   ```bash
   npx supabase secrets set RESEND_API_KEY=re_xxxxx --project-ref ggjjoagjurlirdaenttp
   ```
4. **Ensure `app.settings.supabase_url` and `app.settings.service_role_key`** are set in the Supabase project (these are typically pre-configured on hosted Supabase). If not, add them to vault:
   ```sql
   select vault.create_secret('https://ggjjoagjurlirdaenttp.supabase.co', 'supabase_url');
   select vault.create_secret('your-service-role-key-here', 'service_role_key');
   ```

Until these are done, the trigger fires but the edge function logs a warning and returns 200 without sending.
