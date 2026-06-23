# Phone verification at signup

**Status:** Design approved 2026-06-22.
**Origin:** Harvest from Kiddaboo's working implementation.

## Goal

Require every user (sender and courier) to verify a working US/Canada phone number before they can use the app. The gate sits between password account creation and role selection, and it re-triggers for any existing account whose `phone_verified_at` is still `NULL`.

Phone verification is a hard prerequisite, not an optional badge — its purpose is fraud deterrence, not display.

## Non-goals

- Phone-as-primary-auth. Email + password stays the primary credential; phone is a side-channel verification stored on `profiles`.
- International numbers outside `+1` (US/Canada).
- A reusable shared kernel. That extraction belongs to Phase 4; this spec ports code into Spetza and notes the harvest, but does not build the npm package.

## Background

Kiddaboo ships phone verification today. Its implementation has been live since 2026-04 and survived a tightening pass in 2026-04 that hid `phone_verified_at` from other users behind a generated `is_phone_verified` boolean. Reusing it is faster, lower risk, and sets up the eventual kernel cleanly.

The Kiddaboo flow:

```
signup → (profile create) → PhoneVerify (gate) → app
```

Spetza's existing flow:

```
signup → ChooseRole → SenderHome | CourierHome
```

The change inserts the gate at the equivalent point:

```
signup → PhoneVerify (gate) → ChooseRole → SenderHome | CourierHome
```

## User flow

1. New user signs up with email + password (unchanged).
2. `AuthContext` loads the profile and sees `is_phone_verified === false`.
3. `RequireAuth` redirects to `/verify-phone` for every authenticated route except `/verify-phone` itself. The public routes (`/welcome`, `/signin`) aren't wrapped in `RequireAuth` and don't trigger the gate.
4. `/verify-phone` shows a two-step form:
   - **Step 1 — Phone:** input accepts free-form (`555-123-4567`, `(555) 123 4567`, `+1 555 123 4567`). Client normalizes to E.164 by stripping non-digits and prepending `+1` for 10-digit input or `+` for 11-digit-starting-with-1 input. Submit calls `send-otp`.
   - **Step 2 — Code:** 6-digit input, "Verify" calls `verify-otp`, "Resend" calls `send-otp` again.
5. On successful verification: `AuthContext.refreshProfile()` to pick up `is_phone_verified = true`, then redirect:
   - if `profile.account_type` is null → `/choose-role`
   - if `account_type === 'sender'` → `/sender`
   - if `account_type === 'courier'` → `/courier`
6. A "Back" button signs the user out and returns to `/welcome`.

## Architecture

### Schema

Migration `supabase/migrations/<ts>_phone_verification.sql`:

```sql
alter table public.profiles
  add column if not exists phone_number text,
  add column if not exists phone_verified_at timestamptz;

create unique index if not exists profiles_phone_number_unique
  on public.profiles (phone_number)
  where phone_number is not null;

alter table public.profiles
  add column if not exists is_phone_verified boolean
  generated always as (phone_verified_at is not null) stored;

-- Hide the raw verification timestamp from other users — clients only
-- need the boolean.
revoke select (phone_verified_at) on public.profiles from anon, authenticated;
```

We do **not** port Kiddaboo's `phone_otp_challenges` table. It is dead code in Kiddaboo — left over from a pre-Verify implementation and never written by the current edge functions. Twilio Verify owns the code lifecycle.

### Edge functions

Both functions live under `supabase/functions/` and require a Supabase user JWT.

**`send-otp`** — `POST { phone }` → `{ ok: true }` or `{ ok: false, error }`.

- Validates phone against `/^\+[1-9]\d{6,14}$/`.
- Calls Twilio Verify `POST /v2/Services/{sid}/Verifications` with `To=<phone>`, `Channel=sms`.
- Twilio handles code generation, expiry, delivery, attempt limits, fraud detection.
- Error mapping:
  - Twilio code `60212` → `{ ok: false, error: "rate_limited" }`
  - Other Twilio failures → `{ ok: false, error: "sms_failed", detail }`
  - Invalid phone format → `{ ok: false, error: "invalid_phone" }`
- Returns 200 even for user-actionable errors (the `ok: false` pattern), because `supabase-js` swallows non-2xx response bodies.

**`verify-otp`** — `POST { phone, code }` → `{ ok: true, verified_at }` or `{ ok: false, error }`.

- Validates phone (same regex) and code (`/^\d{6}$/`).
- Calls Twilio Verify `POST /v2/Services/{sid}/VerificationCheck` with `To=<phone>`, `Code=<code>`.
- Status outcomes:
  - `approved` → write `phone_number` + `phone_verified_at = now()` on `profiles`, return `{ ok: true }`.
  - `pending` (code doesn't match) → `{ ok: false, error: "code_mismatch" }`.
  - HTTP 404 (no active verification) → `{ ok: false, error: "no_active_challenge" }`.
  - Unique violation on `phone_number` → `{ ok: false, error: "phone_in_use" }`.

Both functions use **restricted API keys** scoped to Verify (`TWILIO_API_KEY_SID` + `TWILIO_API_KEY_SECRET`), not Account SID + Auth Token. A leaked key is then limited to Verify operations on one service.

### Frontend

**`src/hooks/usePhoneVerification.js`** — verbatim port from Kiddaboo. Status machine: `idle → sending → code_sent → verifying → verified` with split `send_error` / `verify_error` branches. `send_error` keeps the user on the phone form; `verify_error` keeps them on the code form.

**`src/pages/onboarding/PhoneVerify.jsx`** — port from Kiddaboo with Spetza design tokens:
- `bg-cream` (same), `text-ink` (← `text-charcoal`), `text-slate` (← `text-taupe`), `text-signal` for errors (← `text-terracotta`).
- Replace Kiddaboo's `<Button>` with inline `<button>` matching Spetza's existing pages (`px-4 py-3 rounded-lg bg-ink text-cream font-medium hover:bg-signal`).
- Error-copy maps (`SEND_ERROR_COPY`, `VERIFY_ERROR_COPY`) ported as-is.
- Post-verify navigation: replace Kiddaboo's role-aware redirect (nanny/parent/profile-create) with Spetza's: `/choose-role` if `account_type` is null, else `/sender` or `/courier`.

**`src/components/auth/RequireAuth.jsx`** — add the gate:

```jsx
const PHONE_VERIFY_EXEMPT = new Set(['/verify-phone'])

if (
  profile &&
  !profile.is_phone_verified &&
  !PHONE_VERIFY_EXEMPT.has(location.pathname)
) {
  return <Navigate to="/verify-phone" replace />
}
```

Spetza has no admin role today, so we drop Kiddaboo's `profile.role !== 'admin'` exception.

**`src/App.jsx`** — register the route:

```jsx
<Route path="/verify-phone" element={<RequireAuth><PhoneVerify /></RequireAuth>} />
```

The `RequireAuth` wrap is what triggers the gate — `PhoneVerify` itself is in the exempt set so the redirect loop is broken.

**`src/context/AuthContext.jsx`** — already exposes `profile` and `refreshProfile`; `PhoneVerify` uses both. The `profile` query must select `is_phone_verified` (it's the generated boolean), not `phone_verified_at`, since clients no longer have SELECT on the latter after the migration's REVOKE.

## Existing accounts

The migration adds `phone_verified_at` as `NULL` for every existing profile, so `is_phone_verified` is `false` for everyone. On their next sign-in, `RequireAuth` will funnel them through `/verify-phone`. No backfill, no exemption.

Test accounts (`sender+e2e@spetza.test`, `courier+e2e@spetza.test`) will need either a real phone or [Twilio Verify test credentials](https://www.twilio.com/docs/verify/sms#test-the-verification-process) to keep working in dev.

## Twilio setup (out-of-band)

1. Sign in to Twilio (reuse Kiddaboo's account or use a separate one).
2. **Verify → Services** → create a new Service named `spetza` (separate from Kiddaboo for clean isolation).
3. **API Keys → Create Restricted API Key** scoped to Verify only. Note SID and Secret immediately (Secret is shown once).
4. `cd ~/Spetza && supabase secrets set TWILIO_API_KEY_SID=... TWILIO_API_KEY_SECRET=... TWILIO_VERIFY_SERVICE_SID=...`.

## Error UX

| Error code | User-facing copy |
|---|---|
| `invalid_phone` | That doesn't look like a valid phone number. Check it and try again. |
| `sms_failed` | We couldn't text that number. Check that it's correct and can receive SMS, or try another number. |
| `rate_limited` | Too many code requests for that number. Wait a few minutes and try again. |
| `code_mismatch` | Code doesn't match. Try again. |
| `no_active_challenge` | That code expired. Tap Resend to get a new one. |
| `phone_in_use` | This phone is already linked to another account. _(inline JSX with link to `/signin`)_ |

## Testing

- Unit: a small test for `normalizePhone` covering the 10-digit, 11-digit-with-1, and already-`+`-prefixed inputs (matching Kiddaboo's behavior).
- Manual: sign up a fresh account, walk it through `/verify-phone` using Twilio test credentials, confirm landing at `/choose-role`.
- Regression: existing test account sign-in lands at `/verify-phone`, not at `/sender` or `/courier`.

## Harvest ledger update

After this lands, update `~/12Sigma/docs/portfolio/PORTFOLIO-PLAN.md`:

```
| Phone OTP (Twilio Verify) | Kiddaboo → Spetza | Edge functions + RequireAuth gate + hook + page | Candidate for Phase 4 kernel |
```

Cipital and Duke & Mambo will harvest from this same shape when they need verification.

## Out of scope

- Voice fallback (Twilio Verify supports it; not wiring it for now).
- WhatsApp channel.
- Phone change / re-verify flow (a user can't currently swap their phone post-verification; if needed, add it later).
- Removing phone from a deleted account. If `profiles.id → auth.users.id` is already `ON DELETE CASCADE` (to be confirmed during implementation), the phone row goes with the user; if not, we treat it as a follow-up.
