# Courier Verification Redesign

**Date:** 2026-07-23
**Status:** Approved
**Author:** Claude

## Overview

Replace Spetza's manual 3-document courier verification (selfie + ID front + ID
back, human-reviewed) with a lean, mostly-automated model:

1. **Selfie** — a single trust/recognition photo shown to senders/recipients. Not
   an identity check, not reviewed.
2. **Stripe Connect Express KYC** — the actual identity verification (real name,
   DOB, SSN, bank), already part of payout setup.
3. **Checkr background check** — criminal-only, run at activation via Checkr Hosted
   Apply, before a courier can accept their first delivery.

The manual document-review queue and the `verification_documents` id_front/id_back
flow are removed entirely. The only remaining human touch is adjudicating Checkr
`consider` results (flagged records), through a minimal admin surface.

## Goals

- Stronger identity assurance than a human eyeballing an ID photo (Connect KYC).
- A real safety signal for a service where strangers arrive at homes (background check).
- Near-zero ops burden — no manual review of the happy path.
- No FCRA compliance built in-house — Checkr owns consent, PII, notices.

## The New Courier Journey

1. Sign up → phone verification (Twilio) → name — **unchanged**.
2. **Upload selfie** (one photo).
3. **Stripe Connect** payout onboarding — **unchanged** (KYC = identity).
4. **Start background check** → redirected to Checkr Hosted Apply → courier gives
   FCRA consent and enters info on Checkr's hosted page → Spetza waits on webhook.
5. When Checkr returns **`clear`**, the courier is fully activated.

## The Accept Gate

`accept-delivery-request` currently requires `verification_status === 'approved'`
plus the Connect flags. It changes to require **all three**, computed on the fly
(no stored aggregate, so no cache-vs-reality sync bug):

- `selfie_path IS NOT NULL`, **and**
- Stripe `stripe_connect_payouts_enabled` (also `charges_enabled`) — unchanged, **and**
- `background_check_status = 'clear'`

The old `verification_status` gate and `review-verification` edge function are removed.

## Data Model

### `profiles` — add

| Column | Type | Purpose |
|---|---|---|
| `selfie_path` | text | object path in private bucket; signed-URL on display |
| `background_check_status` | text | enum below; default `not_started` |
| `checkr_candidate_id` | text | Checkr candidate handle |
| `checkr_report_id` | text | Checkr report handle |
| `checkr_invitation_id` | text | Hosted Apply invitation handle |
| `background_check_updated_at` | timestamptz | last webhook/adjudication time |
| `background_check_notes` | text | admin note when adjudicating a `consider` |
| `background_check_reviewed_by` | uuid | admin who adjudicated |
| `background_check_reviewed_at` | timestamptz | when adjudicated |

### `profiles` — remove

`verification_status`, `verification_submitted_at`, `verification_reviewed_at`,
`verification_reviewer_id`, `verification_notes`.

### Drop table

`verification_documents` (no more id_front/id_back).

### Keep

`is_admin` (exists), Stripe Connect columns, phone verification columns.

### `background_check_status` semantics

- `not_started` — default; hasn't begun.
- `pending` — invitation sent / report running.
- `clear` — passed (Checkr `clear`, **or** admin approved a `consider`).
- `consider` — Checkr flagged a record → sits in the admin queue.
- `rejected` — admin denied a flagged report (terminal; follows Checkr adverse action).

### New table — `admin_allowlist`

```
admin_allowlist(email text primary key)
```

Seeded via migration with the operator's email. Persists independently of
`auth.users`, so wiping users never removes admin bootstrap.

### New table — `checkr_webhook_deadletter`

```
checkr_webhook_deadletter(
  id bigserial primary key,
  event_type text,
  candidate_id text,
  payload jsonb,
  reason text,
  created_at timestamptz default now()
)
```

Holds webhook events that couldn't be matched to a profile (e.g. candidate row not
yet written — a race) for manual replay.

## Config

`COURIER_PAYS_BACKGROUND_CHECK` — edge-function env var, default `false`. The
who-pays off-ramp: while `false`, the platform absorbs the ~$30 Checkr cost; flip
to `true` later to require a Stripe charge from the courier before the check runs.
Flipping it never retroactively charges in-flight couriers.

Secrets: `CHECKR_API_KEY`, `CHECKR_WEBHOOK_KEY`, `CHECKR_PACKAGE_SLUG` (criminal-only
package configured in the Checkr dashboard).

## Admin Bootstrap

Solves the "raw SQL every time" problem:

- Migration seeds `admin_allowlist` with the operator's email.
- A `SECURITY DEFINER` BEFORE-insert/update trigger on `profiles` looks up the row's
  email from `auth.users` and sets `is_admin = true` when it's in the allowlist.
- Because the allowlist is a separate table, re-signing-up with an allowlisted email
  after a user wipe automatically restores admin — no SQL.

## Edge Functions

### `start-background-check` (courier-invoked)

1. If `COURIER_PAYS_BACKGROUND_CHECK` is `true`, require a successful Stripe charge
   first; on failure, no invitation is created and a retryable error returns.
2. Create a Checkr **candidate** if none exists; store `checkr_candidate_id` on the
   profile **synchronously before returning** (prevents a webhook-before-candidate race).
3. Create a Hosted Apply **invitation** for `CHECKR_PACKAGE_SLUG`; store
   `checkr_invitation_id`; return `invitation_url`.
4. Set `background_check_status = 'pending'`.
5. **Resumable:** if a candidate exists with no completed report, re-issue the invitation.

Client redirects the courier to `invitation_url`.

### `checkr-webhook` (public — no user auth)

1. **Verify the Checkr signature** (HMAC-SHA256 of the raw body with `CHECKR_WEBHOOK_KEY`,
   `X-Checkr-Signature` header). Reject mismatches with 401 — this endpoint flips a
   security-relevant status, so forged calls must never process.
2. Look up the profile by `checkr_candidate_id` from the payload. If not found, write
   to `checkr_webhook_deadletter` and return 200 (stop Checkr's retries).
3. Map event → status, honoring transition guards (below):

| Checkr event | → `background_check_status` |
|---|---|
| `report.created` | `pending` |
| `report.completed`, status `clear` | `clear` |
| `report.completed`, status `consider` | `consider` |
| `report.suspended` / dispute | stays `pending` (holding) |

4. Store `checkr_report_id`, set `background_check_updated_at`.

### `adjudicate-background-check` (admin-invoked)

For a `consider` report:
- **Approve** → set `background_check_status = 'clear'`, record reviewer + notes.
- **Deny** → trigger **Checkr's Adverse Action workflow** via API (Checkr sends the
  FCRA pre-adverse + adverse-action notices and runs the waiting period). The DB
  `rejected` state follows Checkr; record reviewer + notes.

Admin-gated by `is_admin`.

## Transition Guards

- **No downgrade from terminal states:** a late or duplicate `consider` webhook must
  never overwrite an admin's `clear` or `rejected`. Every transition checks the
  current state first.
- **Idempotency:** setting `clear` when already `clear` is a no-op; unmatched events
  go to the dead-letter table; the endpoint returns 200 once handled so Checkr stops
  retrying.
- **Signature failure:** 401, logged, never processed.

## Selfie Storage

Private bucket (reuse `courier-verification` or a fresh `courier-selfies`). Displayed
to senders/recipients via short-lived signed URLs — same pattern as package photos.
Uploaded on the courier verify page, replacing the 3-document uploader.

## Admin Review UI

Repurpose `src/pages/admin/AdminVerifications.jsx` into a background-check review page
at `/admin`:

- Lists only couriers with `background_check_status = 'consider'`.
- Shows name, submitted time, and a **deep link to the Checkr report** in the Checkr
  dashboard. **Spetza never renders report PII** — the record is reviewed in Checkr.
- **Approve** → `clear`; **Deny** → Checkr adverse action → `rejected`. Both take a note.
- Buttons call `adjudicate-background-check`.

## UI Changes

- `CourierVerify.jsx` — replace the 3-document uploader with: a single selfie
  uploader, then a "Start background check" button (enabled once selfie + Connect are
  done) that calls `start-background-check` and redirects to Checkr. Show status
  banners for `pending` / `consider` / `clear` / `rejected`.
- Courier home / profile — reflect background-check status; gate the "accept" affordance.
- Sender/recipient views — show the courier's selfie via signed URL.

## Error Handling

- **Checkr API down** at `start-background-check` → retryable error, status unchanged.
- **Stripe charge fails** (courier-pays on) → no invitation, retryable error.
- **Webhook can't match a profile** → dead-letter + 200.
- **Webhook signature invalid** → 401.
- **DB write fails in webhook** → log; return non-2xx for a bounded number of Checkr
  retries, then dead-letter.

## Migration

No grandfathering. All existing users (including test couriers) are wiped before
launch; everyone goes through the new flow from scratch. The migration:

- Adds/removes the `profiles` columns above.
- Drops `verification_documents`.
- Creates `admin_allowlist` (seeded with operator email) + the `is_admin` trigger.
- Creates `checkr_webhook_deadletter`.
- Removes the `review-verification` edge function.

## Testing

- **Checkr sandbox** deterministic test candidates (specific DOB/SSN → `clear` vs
  `consider`) exercise both branches at zero cost.
- **Unit:** webhook signature verification; transition guards (no terminal downgrade);
  the accept-gate truth table (allows only when selfie + payouts + `clear`);
  admin-bootstrap trigger (allowlisted email → `is_admin` true, others false).
- **Integration:** `start-background-check` creates candidate + invitation and stores
  IDs; webhook updates status by candidate id; dead-letter on unmatched.
- **Manual E2E (sandbox):** full happy path (selfie → Connect → start check → complete
  hosted flow → webhook `clear` → accept enabled), and the `consider` → admin-approve
  path.

## Out of Scope

- Selfie-to-ID face match / liveness (future Stripe Identity upgrade if needed).
- Driving-record (MVR) checks — criminal-only for now.
- Continuous / recurring re-screening.
- Courier-pays flow is built as a toggle but launches `false` (platform absorbs).
