# Phone verification at signup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate every Spetza user behind a Twilio Verify phone OTP between password signup and role selection.

**Architecture:** Schema change on `profiles` (`phone_number`, `phone_verified_at`, generated `is_phone_verified`), two edge functions wrapping Twilio Verify (`send-otp`, `verify-otp`), a `usePhoneVerification` hook driving a `PhoneVerify` page at `/verify-phone`, and a one-line `RequireAuth` gate that redirects unverified profiles there. Code ported from Kiddaboo with Spetza design tokens swapped in.

**Tech Stack:** Supabase (Postgres + Edge Functions, Deno), React + Vite, Tailwind, Twilio Verify API, Vitest.

**Spec:** [docs/superpowers/specs/2026-06-22-phone-verification-design.md](../specs/2026-06-22-phone-verification-design.md)

---

## File Structure

**Create:**
- `supabase/migrations/20260622000003_phone_verification.sql` — columns, unique index, generated boolean, revoke
- `supabase/functions/send-otp/index.ts` — Twilio Verify start
- `supabase/functions/verify-otp/index.ts` — Twilio Verify check + profile write
- `src/hooks/usePhoneVerification.js` — sendCode/verifyCode status machine
- `src/pages/onboarding/PhoneVerify.jsx` — two-step form
- `src/lib/phone.js` — `normalizePhone()` helper (split out so it's unit-testable)
- `src/lib/phone.test.js` — unit tests for `normalizePhone`

**Modify:**
- `src/components/auth/RequireAuth.jsx` — add `is_phone_verified` gate
- `src/App.jsx` — register `/verify-phone` route

**No change needed:**
- `src/context/AuthContext.jsx` — uses `select('*')`, PostgREST silently drops `phone_verified_at` when SELECT is revoked, and includes the generated `is_phone_verified`. Verified by smoke test in Task 10.

---

## Task 0: Out-of-band Twilio setup (Suresh)

This is a prerequisite, not a code task. Do it before Task 2.

- [ ] **Step 1: Create / sign in to Twilio**

  Sign in at https://console.twilio.com. Re-using the Kiddaboo account is fine.

- [ ] **Step 2: Create a Verify Service for Spetza**

  Verify → Services → Create Service. Name it `spetza`. Note the **Service SID** (starts with `VA...`).

- [ ] **Step 3: Create a restricted API key scoped to Verify**

  Account → API keys & tokens → Create API key → **Restricted**. Permissions: select `Verify` only. Note the **SID** (`SK...`) and **Secret** — Secret is shown once.

- [ ] **Step 4: Set the three secrets in Supabase**

  ```bash
  cd ~/Spetza
  supabase secrets set TWILIO_API_KEY_SID=SK... \
                       TWILIO_API_KEY_SECRET=... \
                       TWILIO_VERIFY_SERVICE_SID=VA...
  supabase secrets list
  ```

  Expected: all three names appear in the list.

---

## Task 1: Migration

**Files:**
- Create: `supabase/migrations/20260622000003_phone_verification.sql`

- [ ] **Step 1: Write the migration**

  ```sql
  -- Phone verification on profiles. Backed by Twilio Verify, which owns
  -- the OTP lifecycle (code generation, expiry, attempts). We only store
  -- the resolved phone and a timestamp once verification succeeds.

  alter table public.profiles
    add column if not exists phone_number text,
    add column if not exists phone_verified_at timestamptz;

  -- One phone per account. Partial index so multiple unverified rows
  -- (phone_number IS NULL) don't conflict.
  create unique index if not exists profiles_phone_number_unique
    on public.profiles (phone_number)
    where phone_number is not null;

  -- Public-facing boolean: callers only need to know if a profile is
  -- verified, not when. The raw timestamp is hidden below.
  alter table public.profiles
    add column if not exists is_phone_verified boolean
    generated always as (phone_verified_at is not null) stored;

  -- Hide the raw timestamp from anon/authenticated clients. service_role
  -- (used by verify-otp) keeps full access.
  revoke select (phone_verified_at) on public.profiles from anon, authenticated;
  ```

- [ ] **Step 2: Apply the migration**

  ```bash
  cd ~/Spetza
  supabase db push
  ```

  Expected: `Applying migration 20260622000003_phone_verification.sql...` then `Finished supabase db push.`

- [ ] **Step 3: Verify the schema in the dashboard**

  Open https://supabase.com/dashboard/project/ggjjoagjurlirdaenttp/database/tables, click `profiles`. Confirm new columns: `phone_number`, `phone_verified_at`, `is_phone_verified` (generated). The unique index `profiles_phone_number_unique` should appear under Indexes.

- [ ] **Step 4: Commit**

  ```bash
  cd ~/Spetza
  git add supabase/migrations/20260622000003_phone_verification.sql
  git commit -m "Add phone verification columns to profiles"
  ```

---

## Task 2: `send-otp` edge function

**Files:**
- Create: `supabase/functions/send-otp/index.ts`

- [ ] **Step 1: Write the function**

  ```typescript
  // Delegates OTP delivery to Twilio Verify. Twilio generates the code,
  // sends it over SMS, and owns expiry / attempts / rate-limiting. We
  // never see the code, so no local OTP table is needed.
  //
  // Twilio auth uses a restricted API Key (SK...) scoped to Verify so a
  // leak can't be used to send arbitrary SMS or touch the broader account.

  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const TWILIO_KEY_SID = Deno.env.get("TWILIO_API_KEY_SID")!;
  const TWILIO_KEY_SECRET = Deno.env.get("TWILIO_API_KEY_SECRET")!;
  const TWILIO_VERIFY_SERVICE_SID = Deno.env.get("TWILIO_VERIFY_SERVICE_SID")!;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  async function twilioStartVerification(phone: string) {
    const url = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/Verifications`;
    const params = new URLSearchParams({ To: phone, Channel: "sms" });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${TWILIO_KEY_SID}:${TWILIO_KEY_SECRET}`),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  }

  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    let phone: string;
    try {
      ({ phone } = await req.json());
    } catch {
      return json({ error: "bad_json" }, 400);
    }
    if (!/^\+[1-9]\d{6,14}$/.test(phone || "")) {
      return json({ ok: false, error: "invalid_phone" });
    }

    const result = await twilioStartVerification(phone);
    if (!result.ok) {
      console.error("twilio verify start failed:", result.status, result.body);
      const twilioCode = (result.body as { code?: number })?.code;
      if (twilioCode === 60212) {
        return json({ ok: false, error: "rate_limited" });
      }
      return json({ ok: false, error: "sms_failed", detail: result.body });
    }

    return json({ ok: true });
  });
  ```

- [ ] **Step 2: Deploy the function**

  ```bash
  cd ~/Spetza
  supabase functions deploy send-otp
  ```

  Expected: `Deployed Functions on project ggjjoagjurlirdaenttp: send-otp`.

- [ ] **Step 3: Smoke test with a bad phone number**

  Get an anon key from `.env`, then:

  ```bash
  # Replace with a real signed-in user's access token (grab it from the
  # browser devtools after sign-in: localStorage["sb-ggjjoagjurlirdaenttp-auth-token"]).
  USER_JWT=eyJ...
  curl -sS -X POST "https://ggjjoagjurlirdaenttp.supabase.co/functions/v1/send-otp" \
    -H "Authorization: Bearer $USER_JWT" \
    -H "Content-Type: application/json" \
    -d '{"phone":"not-a-phone"}'
  ```

  Expected: `{"ok":false,"error":"invalid_phone"}`.

- [ ] **Step 4: Commit**

  ```bash
  cd ~/Spetza
  git add supabase/functions/send-otp/index.ts
  git commit -m "Add send-otp edge function (Twilio Verify start)"
  ```

---

## Task 3: `verify-otp` edge function

**Files:**
- Create: `supabase/functions/verify-otp/index.ts`

- [ ] **Step 1: Write the function**

  ```typescript
  // Delegates OTP validation to Twilio Verify's VerificationCheck endpoint.
  // On "approved" status we set profiles.phone_number + phone_verified_at.

  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const TWILIO_KEY_SID = Deno.env.get("TWILIO_API_KEY_SID")!;
  const TWILIO_KEY_SECRET = Deno.env.get("TWILIO_API_KEY_SECRET")!;
  const TWILIO_VERIFY_SERVICE_SID = Deno.env.get("TWILIO_VERIFY_SERVICE_SID")!;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  async function twilioCheckVerification(phone: string, code: string) {
    const url = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`;
    const params = new URLSearchParams({ To: phone, Code: code });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${TWILIO_KEY_SID}:${TWILIO_KEY_SECRET}`),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  }

  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    let phone: string, code: string;
    try {
      ({ phone, code } = await req.json());
    } catch {
      return json({ error: "bad_json" }, 400);
    }
    if (!/^\+[1-9]\d{6,14}$/.test(phone || "") || !/^\d{6}$/.test(code || "")) {
      return json({ error: "invalid_input" }, 400);
    }

    const result = await twilioCheckVerification(phone, code);
    if (!result.ok) {
      if (result.status === 404) {
        return json({ ok: false, error: "no_active_challenge" });
      }
      console.error("twilio verify check failed:", result.status, result.body);
      return json({ ok: false, error: "verify_failed", detail: result.body });
    }

    const status = (result.body as { status?: string })?.status;
    if (status !== "approved") {
      return json({ ok: false, error: "code_mismatch" });
    }

    const now = new Date().toISOString();
    const { error: profErr } = await admin
      .from("profiles")
      .update({ phone_number: phone, phone_verified_at: now })
      .eq("id", userId);
    if (profErr) {
      if ((profErr as { code?: string }).code === "23505") {
        return json({ ok: false, error: "phone_in_use" });
      }
      return json({ error: "db_error", detail: profErr.message }, 500);
    }

    return json({ ok: true, verified_at: now });
  });
  ```

- [ ] **Step 2: Deploy the function**

  ```bash
  cd ~/Spetza
  supabase functions deploy verify-otp
  ```

  Expected: `Deployed Functions on project ggjjoagjurlirdaenttp: verify-otp`.

- [ ] **Step 3: Smoke test with malformed input**

  ```bash
  USER_JWT=eyJ...   # same token as Task 2 step 3
  curl -sS -X POST "https://ggjjoagjurlirdaenttp.supabase.co/functions/v1/verify-otp" \
    -H "Authorization: Bearer $USER_JWT" \
    -H "Content-Type: application/json" \
    -d '{"phone":"+15551234567","code":"abc"}'
  ```

  Expected: `{"error":"invalid_input"}` (HTTP 400).

- [ ] **Step 4: Commit**

  ```bash
  cd ~/Spetza
  git add supabase/functions/verify-otp/index.ts
  git commit -m "Add verify-otp edge function (Twilio Verify check + profile write)"
  ```

---

## Task 4: `normalizePhone` helper + tests

**Files:**
- Create: `src/lib/phone.js`
- Create: `src/lib/phone.test.js`

- [ ] **Step 1: Write the failing test**

  ```javascript
  // src/lib/phone.test.js
  import { describe, expect, it } from 'vitest'
  import { normalizePhone } from './phone.js'

  describe('normalizePhone', () => {
    it('adds +1 to a bare 10-digit US number', () => {
      expect(normalizePhone('5551234567')).toBe('+15551234567')
    })

    it('formats human-typed punctuation', () => {
      expect(normalizePhone('(555) 123-4567')).toBe('+15551234567')
      expect(normalizePhone('555.123.4567')).toBe('+15551234567')
    })

    it('adds + to an 11-digit number starting with 1', () => {
      expect(normalizePhone('15551234567')).toBe('+15551234567')
    })

    it('leaves an already-prefixed number alone (sans punctuation)', () => {
      expect(normalizePhone('+1 555 123 4567')).toBe('+15551234567')
      expect(normalizePhone('+447911123456')).toBe('+447911123456')
    })

    it('returns empty for empty / nullish input', () => {
      expect(normalizePhone('')).toBe('+')
      expect(normalizePhone(null)).toBe('+')
      expect(normalizePhone(undefined)).toBe('+')
    })
  })
  ```

- [ ] **Step 2: Run the test to verify it fails**

  ```bash
  cd ~/Spetza
  npx vitest run src/lib/phone.test.js
  ```

  Expected: FAIL with `Cannot find module './phone.js'` or `normalizePhone is not a function`.

- [ ] **Step 3: Write the implementation**

  ```javascript
  // src/lib/phone.js

  // Spetza is US/Canada-focused (per spec). Users naturally type spaces,
  // dashes, parens, dots — strip them client-side so the user doesn't
  // have to think about E.164. Bare 10-digit input gets +1 prepended;
  // 11-digit starting with 1 gets a + added. Anything explicitly
  // prefixed with + is honored (just stripped of punctuation), which
  // is what lets non-US numbers through if a user really wants one.
  export function normalizePhone(raw) {
    const trimmed = (raw || '').trim()
    if (trimmed.startsWith('+')) {
      return `+${trimmed.replace(/\D/g, '')}`
    }
    const digits = trimmed.replace(/\D/g, '')
    if (digits.length === 10) return `+1${digits}`
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
    return `+${digits}`
  }
  ```

- [ ] **Step 4: Run the test to verify it passes**

  ```bash
  cd ~/Spetza
  npx vitest run src/lib/phone.test.js
  ```

  Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  cd ~/Spetza
  git add src/lib/phone.js src/lib/phone.test.js
  git commit -m "Add normalizePhone helper with unit tests"
  ```

---

## Task 5: `usePhoneVerification` hook

**Files:**
- Create: `src/hooks/usePhoneVerification.js`

- [ ] **Step 1: Write the hook**

  ```javascript
  // src/hooks/usePhoneVerification.js
  //
  // Drives the OTP UI. Status machine:
  //   idle → sending → code_sent → verifying → verified
  //              ↘ send_error              ↘ verify_error
  //
  // send_error and verify_error are split so the UI can keep the user
  // on the correct form: send failures must NOT drop them onto the
  // code-entry screen, because no code was ever sent.

  import { useState } from 'react'
  import { supabase } from '../lib/supabase.js'

  export function usePhoneVerification() {
    const [status, setStatus] = useState('idle')
    const [error, setError] = useState(null)

    async function sendCode(phone) {
      setStatus('sending')
      setError(null)
      const { data, error } = await supabase.functions.invoke('send-otp', { body: { phone } })
      if (error || !data?.ok) {
        setStatus('send_error')
        setError(data?.error || error?.message || 'send_failed')
        return { error: error ?? new Error(data?.error || 'send_failed') }
      }
      setStatus('code_sent')
      return { error: null }
    }

    async function verifyCode(phone, code) {
      setStatus('verifying')
      setError(null)
      const { data, error } = await supabase.functions.invoke('verify-otp', { body: { phone, code } })
      if (error || !data?.ok) {
        setStatus('verify_error')
        setError(data?.error || error?.message || 'verify_failed')
        return { error: error ?? new Error(data?.error || 'verify_failed') }
      }
      setStatus('verified')
      return { data, error: null }
    }

    function reset() {
      setStatus('idle')
      setError(null)
    }

    return { status, error, sendCode, verifyCode, reset }
  }
  ```

- [ ] **Step 2: Sanity-check by importing it via Vite**

  Open `~/Spetza/src/App.jsx`, add a temporary line at the top:

  ```javascript
  import { usePhoneVerification as _check } from './hooks/usePhoneVerification.js'
  void _check
  ```

  Restart vite (`Ctrl-C` then `npm run dev`). Confirm no import error in the browser console. Then **remove** the two lines before committing.

- [ ] **Step 3: Commit**

  ```bash
  cd ~/Spetza
  git add src/hooks/usePhoneVerification.js
  git commit -m "Add usePhoneVerification hook"
  ```

---

## Task 6: `PhoneVerify` page

**Files:**
- Create: `src/pages/onboarding/PhoneVerify.jsx`

- [ ] **Step 1: Create the directory if needed**

  ```bash
  mkdir -p ~/Spetza/src/pages/onboarding
  ```

- [ ] **Step 2: Write the page**

  ```jsx
  // src/pages/onboarding/PhoneVerify.jsx
  //
  // Two-step OTP page. Step 1 collects an E.164 phone and calls send-otp.
  // Step 2 collects a 6-digit code and calls verify-otp. On success we
  // refresh the profile so RequireAuth sees is_phone_verified=true,
  // then route to /choose-role (no account_type yet) or to the role
  // home.

  import { useState } from 'react'
  import { Link, useNavigate } from 'react-router-dom'
  import { useAuth } from '../../context/AuthContext.jsx'
  import { usePhoneVerification } from '../../hooks/usePhoneVerification.js'
  import { normalizePhone } from '../../lib/phone.js'

  const SEND_ERROR_COPY = {
    invalid_phone: "That doesn't look like a valid phone number. Check it and try again.",
    sms_failed: "We couldn't text that number. Check that it's correct and can receive SMS, or try another number.",
    rate_limited: 'Too many code requests for that number. Wait a few minutes and try again.',
  }

  const VERIFY_ERROR_COPY = {
    code_mismatch: "Code doesn't match. Try again.",
    no_active_challenge: 'That code expired. Tap Resend to get a new one.',
    // phone_in_use is rendered inline as JSX (link to /signin)
  }

  export default function PhoneVerify() {
    const navigate = useNavigate()
    const { profile, refreshProfile, signOut } = useAuth()
    const { status, error, sendCode, verifyCode } = usePhoneVerification()
    const [phone, setPhone] = useState('')
    const [code, setCode] = useState('')

    async function onCancel() {
      await signOut()
      navigate('/welcome', { replace: true })
    }

    async function onSend(e) {
      e.preventDefault()
      await sendCode(normalizePhone(phone))
    }

    async function onVerify(e) {
      e.preventDefault()
      const { error: err } = await verifyCode(normalizePhone(phone), code)
      if (err) return

      // Refresh so RequireAuth picks up is_phone_verified before we
      // navigate; otherwise the next route bounces us back here.
      await refreshProfile()

      if (!profile?.account_type) {
        navigate('/choose-role', { replace: true })
      } else if (profile.account_type === 'courier') {
        navigate('/courier', { replace: true })
      } else {
        navigate('/sender', { replace: true })
      }
    }

    const showCodeStep =
      status === 'code_sent' || status === 'verifying' || status === 'verify_error'

    return (
      <div className="min-h-full px-6 py-12 max-w-md mx-auto">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-slate hover:text-ink"
        >
          &larr; back
        </button>
        <h1 className="font-serif text-3xl text-ink mt-6">Verify your phone</h1>
        <p className="text-sm text-slate mt-2">
          We send a 6-digit code to make sure you're a real person. We won't share your number.
        </p>

        {!showCodeStep && (
          <form onSubmit={onSend} className="mt-8 space-y-4">
            <label className="block">
              <div className="text-xs uppercase tracking-widest text-slate mb-2">
                Phone number
              </div>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 123 4567"
                className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
              />
            </label>
            {status === 'send_error' && (
              <p className="text-xs text-signal">
                {SEND_ERROR_COPY[error] || 'Something went wrong. Try again.'}
              </p>
            )}
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full px-4 py-3 rounded-lg bg-ink text-cream font-medium hover:bg-signal transition-colors disabled:opacity-50"
            >
              {status === 'sending' ? 'Sending…' : 'Send code'}
            </button>
          </form>
        )}

        {showCodeStep && (
          <form onSubmit={onVerify} className="mt-8 space-y-4">
            <label className="block">
              <div className="text-xs uppercase tracking-widest text-slate mb-2">
                Enter the 6-digit code
              </div>
              <input
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
                className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none text-center text-2xl tracking-widest"
              />
            </label>
            {error === 'phone_in_use' ? (
              <p className="text-xs text-signal">
                This phone is already linked to another account.{' '}
                <Link to="/signin" className="underline">
                  Sign in instead?
                </Link>
              </p>
            ) : error ? (
              <p className="text-xs text-signal">
                {VERIFY_ERROR_COPY[error] || 'Something went wrong. Try again.'}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={status === 'verifying'}
              className="w-full px-4 py-3 rounded-lg bg-ink text-cream font-medium hover:bg-signal transition-colors disabled:opacity-50"
            >
              {status === 'verifying' ? 'Verifying…' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={() => sendCode(normalizePhone(phone))}
              className="block w-full text-center text-xs text-signal hover:underline"
            >
              Resend code
            </button>
          </form>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  cd ~/Spetza
  git add src/pages/onboarding/PhoneVerify.jsx
  git commit -m "Add PhoneVerify onboarding page"
  ```

---

## Task 7: Register `/verify-phone` route

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add the import and route**

  In `src/App.jsx`, add this import alongside the others:

  ```jsx
  import PhoneVerify from './pages/onboarding/PhoneVerify.jsx'
  ```

  And add this `<Route>` inside the `<Routes>` block, after `/choose-role`:

  ```jsx
  <Route path="/verify-phone" element={<RequireAuth><PhoneVerify /></RequireAuth>} />
  ```

  Final `App.jsx` `<Routes>` block:

  ```jsx
  <Routes>
    <Route path="/welcome" element={<Welcome />} />
    <Route path="/signin" element={<SignIn />} />
    <Route path="/verify-phone" element={<RequireAuth><PhoneVerify /></RequireAuth>} />
    <Route path="/choose-role" element={<RequireAuth><ChooseRole /></RequireAuth>} />
    <Route path="/" element={<RequireAuth><RootRedirect /></RequireAuth>} />
    <Route path="/sender" element={<RequireAuth><RequireRole role="sender"><SenderHome /></RequireRole></RequireAuth>} />
    <Route path="/sender/new" element={<RequireAuth><RequireRole role="sender"><NewRequest /></RequireRole></RequireAuth>} />
    <Route path="/sender/requests/:id/edit" element={<RequireAuth><RequireRole role="sender"><EditRequest /></RequireRole></RequireAuth>} />
    <Route path="/courier" element={<RequireAuth><RequireRole role="courier"><CourierHome /></RequireRole></RequireAuth>} />
    <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
  </Routes>
  ```

- [ ] **Step 2: Verify the route renders**

  Make sure the dev server is up (`npm run dev`). In the preview, sign in and navigate directly to `http://localhost:3000/verify-phone`. The "Verify your phone" page should render (the gate from Task 8 isn't wired yet, so this is just the raw render check).

- [ ] **Step 3: Commit**

  ```bash
  cd ~/Spetza
  git add src/App.jsx
  git commit -m "Register /verify-phone route"
  ```

---

## Task 8: Wire the `RequireAuth` gate

**Files:**
- Modify: `src/components/auth/RequireAuth.jsx`

- [ ] **Step 1: Add the gate**

  Replace the contents of `src/components/auth/RequireAuth.jsx` with:

  ```jsx
  import { Navigate, useLocation } from 'react-router-dom'
  import { useAuth } from '../../context/AuthContext.jsx'

  // Routes that an unverified authenticated user is allowed to hit
  // without being bounced back to /verify-phone. /verify-phone itself
  // must be in here or we'd render a redirect loop.
  const PHONE_VERIFY_EXEMPT = new Set(['/verify-phone'])

  export default function RequireAuth({ children }) {
    const { user, profile, loading } = useAuth()
    const location = useLocation()

    if (loading) {
      return (
        <div className="min-h-full flex items-center justify-center text-slate">
          Loading...
        </div>
      )
    }

    if (!user) {
      return <Navigate to="/welcome" replace />
    }

    // Once the profile has loaded, gate on phone verification. We only
    // act when profile is non-null — otherwise a slow profile fetch
    // would bounce the user to /verify-phone before we know their state.
    if (
      profile &&
      !profile.is_phone_verified &&
      !PHONE_VERIFY_EXEMPT.has(location.pathname)
    ) {
      return <Navigate to="/verify-phone" replace />
    }

    return children
  }
  ```

- [ ] **Step 2: Verify the redirect works without a real OTP**

  In the browser (dev server already running), sign out, then sign in as `sender+e2e@spetza.test` (password `testpass1`). After successful sign-in you should be redirected to `/verify-phone` instead of `/sender`. The "Verify your phone" page should render.

  Don't proceed past the phone-entry form — Twilio isn't configured for test creds yet (covered in Task 10).

- [ ] **Step 3: Commit**

  ```bash
  cd ~/Spetza
  git add src/components/auth/RequireAuth.jsx
  git commit -m "Gate authenticated routes on phone verification"
  ```

---

## Task 9: AuthContext profile sanity check

**Files:**
- Inspect only — likely no change required.

- [ ] **Step 1: Confirm the profile query returns `is_phone_verified`**

  In the browser console (signed in as `sender+e2e@spetza.test`, sitting on `/verify-phone`):

  ```javascript
  const { data } = await (await import('/src/lib/supabase.js')).supabase
    .from('profiles')
    .select('*')
    .eq('id', (await (await import('/src/lib/supabase.js')).supabase.auth.getUser()).data.user.id)
    .single()
  console.log(data)
  ```

  Expected: the logged object includes `is_phone_verified: false`. The key `phone_verified_at` should be **absent** (PostgREST silently drops columns the user can't SELECT).

- [ ] **Step 2: If `is_phone_verified` is missing, modify AuthContext**

  Only do this if Step 1 didn't return the column. Open `src/context/AuthContext.jsx` line 41-46 and change the select to be explicit:

  ```jsx
  const fetchProfile = useCallback(async (uid) => {
    const { data } = await supabase
      .from('profiles')
      .select(
        'id, account_type, stripe_customer_id, stripe_payment_method_id, stripe_connect_account_id, home_address, home_lat, home_lng, service_radius_miles, phone_number, is_phone_verified'
      )
      .eq('id', uid)
      .maybeSingle()
    setProfile(data ?? null)
  }, [])
  ```

  (If you actually edit this file, run `git diff` to confirm the only change is the `.select(...)` call.)

- [ ] **Step 3: Commit (only if Step 2 made a change)**

  ```bash
  cd ~/Spetza
  git add src/context/AuthContext.jsx
  git commit -m "Select is_phone_verified explicitly from profiles"
  ```

---

## Task 10: End-to-end smoke test with Twilio test credentials

This is a manual happy-path walk-through. Twilio Verify has built-in test credentials so you don't burn SMS during dev.

- [ ] **Step 1: Configure Twilio test credentials**

  In the Twilio console: **Account → API keys & tokens → Auth tokens & test credentials**. Note the **Test Account SID** and **Test Auth Token**. These are NOT the live ones.

  Twilio Verify's test environment accepts any number in `+15005550006` format (their reserved test range — see https://www.twilio.com/docs/iam/test-credentials#test-sms-messages-parameters), and any verify-check with code `123456` returns `approved`.

  For now use a **real US mobile number** you can read SMS on. The test credentials path requires switching API base hosts and complicates the function — easier to use a real number once.

- [ ] **Step 2: Walk a fresh sender through the gate**

  In the browser preview:
  1. Sign up at `/signin` with a new email like `sender+verify@spetza.test`, password `testpass1`. Click "Create account with this password."
  2. **Expected:** redirected to `/verify-phone` automatically (the gate fires).
  3. Type your real US number (any format), click **Send code**.
  4. **Expected:** an SMS arrives within ~10 sec.
  5. Type the 6-digit code, click **Verify**.
  6. **Expected:** redirected to `/choose-role`.
  7. Pick **Sender**.
  8. **Expected:** lands on `/sender` (empty list).

- [ ] **Step 3: Confirm existing accounts also get gated**

  1. Sign out.
  2. Sign in as the existing `sender+e2e@spetza.test` / `testpass1`.
  3. **Expected:** also bounced to `/verify-phone`. (You can sign out instead of completing verification.)

- [ ] **Step 4: Confirm the `phone_in_use` path**

  1. Sign out.
  2. Sign up a brand new account, e.g. `dup+verify@spetza.test` / `testpass1`.
  3. On `/verify-phone`, enter the **same** US number you used in Step 2.
  4. Send + verify with the SMS code.
  5. **Expected:** the verify step shows "This phone is already linked to another account." with a link to `/signin`.

- [ ] **Step 5: No commit needed**

  This task is verification only. If any expected step fails, drop back into the relevant earlier task to fix.

---

## Task 11: Update the portfolio harvest ledger

**Files:**
- Modify: `~/12Sigma/docs/portfolio/PORTFOLIO-PLAN.md`

- [ ] **Step 1: Add an entry to the Harvest ledger**

  Open `~/12Sigma/docs/portfolio/PORTFOLIO-PLAN.md` and find the Harvest ledger table. Append a row:

  ```markdown
  | Phone OTP (Twilio Verify) | Kiddaboo → Spetza | `send-otp` + `verify-otp` edge functions, `usePhoneVerification` hook, `PhoneVerify` page, `RequireAuth` gate | Candidate for Phase 4 kernel |
  ```

  If the ledger doesn't exist yet (e.g. there's no table header), create one above the row:

  ```markdown
  ## Harvest ledger

  | Capability | Direction | Surface area | Notes |
  |---|---|---|---|
  | Phone OTP (Twilio Verify) | Kiddaboo → Spetza | `send-otp` + `verify-otp` edge functions, `usePhoneVerification` hook, `PhoneVerify` page, `RequireAuth` gate | Candidate for Phase 4 kernel |
  ```

- [ ] **Step 2: Commit in 12Sigma**

  ```bash
  cd ~/12Sigma
  git add docs/portfolio/PORTFOLIO-PLAN.md
  git commit -m "Portfolio: harvest phone OTP from Kiddaboo to Spetza"
  ```

---

## Done

After Task 11 you have:
- Phone verification gating every authenticated route except `/verify-phone`.
- Live Twilio Verify integration with a restricted API key.
- Unit-tested `normalizePhone` helper.
- Portfolio harvest ledger updated so Cipital and D&M know where to copy from next.

Open items left as out-of-scope (per the spec): voice fallback, WhatsApp channel, post-verify phone change flow.
