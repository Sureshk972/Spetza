# Stripe live-key cutover runbook

Moves Spetza from the Stripe **sandbox** account to **live** mode: real cards,
real payouts to couriers, real $40 background-check charges.

**Do this in the same sitting as [the Checkr cutover](checkr-cutover.md).**
Live Stripe with staging Checkr means couriers pay a real $40 for a fake
background check — the worst available combination.

**Order matters:** Supabase Pro → Stripe live → Checkr production → one real
delivery. About 90 minutes, most of it waiting.

---

## 0. Supabase Pro first (Suresh, dashboard) — do not skip

The Spetza project is on the free tier, which **auto-pauses after ~7 idle days**.
It already happened once (17 Sep): the hostname stopped resolving and nobody
could sign in. A paused database during launch week locks out every courier and
sender.

1. supabase.com → the Spetza project → **Settings → Billing** → upgrade to
   **Pro** (his card).
2. Confirm the project shows Pro before touching anything below.

---

## 1. What lives where (read once)

| Secret | Where it lives | Who reads it |
|---|---|---|
| `STRIPE_SECRET_KEY` | Supabase secrets | every payment edge function |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Netlify env | the browser |
| `STRIPE_PAYMENT_WEBHOOK_SECRET` | Supabase secrets | `stripe-payment-webhook` |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Supabase secrets | `stripe-connect-webhook` |
| `STRIPE_CONNECT_ACCOUNTS_WEBHOOK_SECRET` | Supabase secrets | `stripe-connect-webhook` |

Both webhook functions accept **several** secrets at once
(`_shared/stripeWebhook.ts::webhookSecrets`), so a live secret can be added
beside the sandbox one and both destinations keep working during the swap.

---

## 2. Live account setup (Suresh, dashboard)

In the **Spetza** Stripe account, switched to **live** mode (not sandbox):

1. **Connect** → enable it, platform type **Marketplace** — same as the sandbox.
   Without this, couriers cannot be onboarded and nothing can be paid out.
2. **Developers → API keys** → copy the live **Secret key** (`sk_live_…`) and the
   live **Publishable key** (`pk_live_…`).
3. Business details, bank account and tax info must be complete, or payouts sit
   in the balance and never leave.

## 3. Three live webhook destinations (Suresh, dashboard)

All three point at the same Supabase project. Each issues its **own signing
secret** — copy each one as you create it.

| # | Destination URL | Scope | Events |
|---|---|---|---|
| 1 | `https://ggjjoagjurlirdaenttp.supabase.co/functions/v1/stripe-payment-webhook` | **Your account** | `charge.dispute.created`, `charge.dispute.closed`, `payment_intent.payment_failed` |
| 2 | `https://ggjjoagjurlirdaenttp.supabase.co/functions/v1/stripe-connect-webhook` | **Your account** | `transfer.created` |
| 3 | `https://ggjjoagjurlirdaenttp.supabase.co/functions/v1/stripe-connect-webhook` | **Connected accounts** | `account.updated` |

Destinations 2 and 3 share a URL and differ only in scope — that is deliberate:
`transfer.created` is a platform object, `account.updated` belongs to the
connected account.

Spetza takes **destination charges**, which Stripe classes as indirect charges
scoped to "Your account" — so destination 1 is correct as "Your account", not
Connect.

## 4. Swap the secrets (Claude, CLI)

```bash
cd ~/Spetza
supabase secrets set STRIPE_SECRET_KEY='sk_live_…'
supabase secrets set STRIPE_PAYMENT_WEBHOOK_SECRET='whsec_…'           # destination 1
supabase secrets set STRIPE_CONNECT_WEBHOOK_SECRET='whsec_…'           # destination 2
supabase secrets set STRIPE_CONNECT_ACCOUNTS_WEBHOOK_SECRET='whsec_…'  # destination 3
```

Redeploy everything that talks to Stripe:

```bash
supabase functions deploy stripe-payment-webhook
supabase functions deploy stripe-connect-webhook
supabase functions deploy accept-delivery-request
supabase functions deploy complete-delivery
supabase functions deploy cancel-delivery
supabase functions deploy report-delivery
supabase functions deploy send-tip
supabase functions deploy connect-courier
supabase functions deploy refresh-connect-status
supabase functions deploy setup-sender-payment
supabase functions deploy save-sender-payment-method
supabase functions deploy list-sender-payment-methods
supabase functions deploy detach-sender-payment-method
supabase functions deploy create-bgcheck-payment
supabase functions deploy start-background-check
```

Then the browser key, in **Netlify → Site settings → Environment variables**:

- `VITE_STRIPE_PUBLISHABLE_KEY` = `pk_live_…`
- Decide `VITE_TEST_MODE` (below), then **trigger a redeploy** — Netlify bakes
  these in at build time, so a changed variable does nothing until it rebuilds.

### `VITE_TEST_MODE`

Currently `false`, left off deliberately so Twilio's A2P reviewers saw a site
matching the submission. The campaign was approved 2 Sep, so this is now a free
choice — leaving it `false` is correct for launch (no test banner on a live
site).

## 5. Old test data must go (Claude, CLI)

Stripe ids from the sandbox account are meaningless in live mode. Every one left
on a profile will fail in a way that looks like a bug.

```bash
supabase db query --linked "select id, first_name, account_type, stripe_customer_id, stripe_connect_account_id, stripe_default_payment_method_id, bgcheck_checkout_session_id from profiles where stripe_customer_id is not null or stripe_connect_account_id is not null"
```

For each test account, clear the sandbox ids (service role — the guard trigger
reverts writes otherwise):

```sql
set role service_role;
update profiles
set stripe_customer_id = null,
    stripe_connect_account_id = null,
    stripe_connect_payouts_enabled = false,
    stripe_default_payment_method_id = null,
    bgcheck_checkout_session_id = null,
    bgcheck_paid_at = null
where id = '<profile id>';
```

Re-select afterwards to confirm — a silent no-op is the standard failure here.

Then each test account re-onboards for real: courier connects payouts again,
sender adds a card again.

## 6. Prove each webhook once (Claude + Suresh)

Nothing below is assumed. Every one of these produced a real failure at some
point in sandbox.

| What | How | Pass |
|---|---|---|
| `account.updated` | courier connects payouts on the live account | `stripe_connect_payouts_enabled` flips true within a minute |
| `payment_intent.payment_failed` | a card that declines on a real delivery | operator email arrives at contact@12sigma.com |
| `charge.dispute.created` | Stripe dashboard → send test event to destination 1 | Stripe shows 200, row in Admin → Payments → Disputes |
| `transfer.created` | complete one real delivery | transfer row appears in Stripe |

```bash
supabase functions logs stripe-payment-webhook
supabase functions logs stripe-connect-webhook
```

A 401 here means a wrong signing secret and is indistinguishable from a forgery
in the logs — check the secret before suspecting anything else.

## 7. One real delivery, end to end (Suresh, two phones)

Real card, real payout, small amount.

1. Sender posts a short delivery, courier accepts → card **authorized**
   (`payment_intent` created, not captured).
2. Pickup PIN → picked up → delivered with photo → **captured**.
3. Check in Stripe: payment captured, application fee taken, transfer created to
   the courier's connected account.
4. Check the courier's Stripe balance. First payout on a new connected account
   can be held 7–14 days — expected, not a fault.

```bash
supabase db query --linked "select order_number, status, accepted_price_cents, platform_fee_cents, tip_cents, stripe_payment_intent_id from delivery_requests order by created_at desc limit 3"
```

## 8. Then the doors open

Only after step 7 and the Checkr runbook's step 6 both pass. Until then, do not
run the [courier recruiting ads](../marketing/courier-recruiting.md).

---

## Rollback

Swap the four secrets back to their sandbox values and redeploy the same
function list. Live customers created in the meantime stay in the live account —
nothing is destroyed, but any live delivery in flight will lose its payment
path, so only roll back between deliveries.

---

## Known gaps, decided not to block on

- **`create-bgcheck-payment` hardcodes $40** (`BGCHECK_PRICE_CENTS`). Fine, but
  it is a code change, not a dashboard setting, if the price ever moves.
  (Who pays it is a live switch: Admin → Background Checks.)
- **Stripe CLI is installed at `~/bin/stripe` but not logged in.** `stripe login`
  needs a browser; useful for firing test events without the dashboard.
- **First payout delay** (7–14 days on a new connected account) is real money
  couriers will ask about. The app already says so; be ready to repeat it.
