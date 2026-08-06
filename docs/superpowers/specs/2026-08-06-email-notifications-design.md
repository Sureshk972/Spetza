# Email Notifications — Design Spec

**Date:** 2026-08-06  
**Status:** Approved

## Overview

Transactional email notifications for all delivery lifecycle events, sent to both sender and courier as appropriate.

## Email Provider

**Resend** — simple API, 3,000 free emails/month, one npm package.

- Secret: `RESEND_API_KEY` (Supabase edge function secret)
- From: `Spetza <notifications@spetza.com>` (domain must be verified in Resend)

## Events & Recipients

| Event | Trigger | Sender Email | Courier Email |
|---|---|---|---|
| Order created | INSERT on `delivery_requests` | ✅ | — |
| Accepted | status → `accepted` | ✅ | ✅ |
| Picked up | status → `picked_up` | ✅ | ✅ |
| Delivered | status → `delivered` | ✅ | ✅ |
| Cancelled | status → `cancelled` | ✅ | ✅ (if assigned) |

9 email templates total.

## Subject Lines

All subject lines are prefixed with the order number:

- **Created → Sender:** `SPZ-XXXXX — Your delivery request is live`
- **Accepted → Sender:** `SPZ-XXXXX — A courier accepted your delivery`
- **Accepted → Courier:** `SPZ-XXXXX — You accepted a delivery`
- **Picked up → Sender:** `SPZ-XXXXX — Your package has been picked up`
- **Picked up → Courier:** `SPZ-XXXXX — Picked up, en route to dropoff`
- **Delivered → Sender:** `SPZ-XXXXX — Your package has been delivered`
- **Delivered → Courier:** `SPZ-XXXXX — Delivery complete, earnings on the way`
- **Cancelled → Sender:** `SPZ-XXXXX — Your delivery was cancelled`
- **Cancelled → Courier:** `SPZ-XXXXX — The delivery was cancelled`

## Email Body

Every email includes:
- Order number (prominent, top of email)
- Pickup address
- Dropoff address
- Price
- Package size
- Counterparty's first name (where applicable)
- Branded: Spetza teal (#0378A6), Nunito font, clean minimal layout

## Architecture

### 1. `_shared/email.ts`

Shared utility used by the edge function:

- `sendDeliveryEmail(event, delivery, recipient)` — sends one email via Resend API
- Contains all 9 HTML email templates inline
- Handles Resend API errors gracefully (log, don't throw)

### 2. `send-notification` Edge Function

- Endpoint: `POST /send-notification`
- Input: `{ delivery_request_id: uuid, event: string }`
- Auth: service-role only (called from DB trigger, not user-facing)
- Logic:
  1. Look up delivery request + sender profile + courier profile (if assigned)
  2. Look up sender's email from `auth.users` (requires service-role client)
  3. Look up courier's email from `auth.users` (if courier assigned)
  4. Determine which emails to send based on event type
  5. Call `sendDeliveryEmail()` for each recipient
  6. Return 200 regardless — email failure is non-blocking

### 3. Postgres Trigger + pg_net

Migration creates:

1. Enable `pg_net` extension (async HTTP from Postgres)
2. Function `notify_delivery_status()`:
   - On INSERT: event = `'created'`
   - On UPDATE where `OLD.status != NEW.status`:
     - `NEW.status = 'accepted'` → event = `'accepted'`
     - `NEW.status = 'picked_up'` → event = `'picked_up'`
     - `NEW.status = 'delivered'` → event = `'delivered'`
     - `NEW.status = 'cancelled'` → event = `'cancelled'`
   - Calls `pg_net.http_post()` to invoke the `send-notification` edge function
   - Uses the `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from vault or hardcoded in the function
3. Trigger `delivery_requests_notify` AFTER INSERT OR UPDATE on `delivery_requests`

### Error Handling

- Email send failures are logged but never block the delivery flow
- The pg_net call is async — the trigger returns immediately
- If Resend is down, the email is simply not sent (no retry queue for v1)
- Edge function returns 200 even on email failure to prevent pg_net retries

## Setup Required

1. Sign up at resend.com, get API key
2. Verify `spetza.com` domain in Resend (DNS records)
3. Set secret: `npx supabase secrets set RESEND_API_KEY=re_xxxxx`
4. Deploy edge function: `npx supabase functions deploy send-notification`
5. Push migration: `npx supabase db push`
