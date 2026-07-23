# Courier Verification Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual 3-document courier verification with selfie + Stripe Connect KYC + a Checkr criminal-only background check, gated before first delivery accept, with a minimal admin surface only for flagged (`consider`) reports.

**Architecture:** A Postgres migration reshapes `profiles` (drops the old verification columns + `verification_documents`, adds `selfie_path` and Checkr/background columns) and adds an email-allowlist admin bootstrap. Three new edge functions drive the Checkr Hosted Apply flow (`start-background-check`, `checkr-webhook`, `adjudicate-background-check`) via a shared `_shared/checkr.ts` helper. The accept gate becomes `selfie_path AND payouts_enabled AND background_check_status = 'clear'`. Client pages (CourierVerify, CourierHome, CourierProfile, AdminVerifications) are rewired to the new model.

**Tech Stack:** Supabase (Postgres + Deno edge functions), Checkr API (Hosted Apply + webhooks), React (Vite), Stripe (existing Connect; optional courier-pays charge), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-courier-verification-redesign.md`

**Checkr API facts (verified against docs.checkr.com):**
- `POST /v1/candidates` — create candidate; pass `custom_id` = Spetza user id for cross-reference.
- `POST /v1/invitations` — Hosted Apply; body `{ candidate_id, package }`; returns `invitation_url`. Checkr collects PII + serves FCRA disclosure/authorization.
- Webhooks: `X-Checkr-Signature` = HMAC-SHA256 hex of the **raw request body**, key = your API key (`CHECKR_API_KEY`). Report events: `report.created`, `report.completed` (with `status` `clear` | `consider`), `report.suspended`.
- Checkr uses HTTP Basic auth: `Authorization: Basic base64(API_KEY + ":")`.

---

## File Structure

**Migrations (create):**
- `supabase/migrations/20260723000002_courier_verification_redesign.sql` — all schema changes, admin bootstrap, dead-letter, drops.

**Edge functions (create):**
- `supabase/functions/_shared/checkr.ts` — Checkr REST helpers + signature verification.
- `supabase/functions/start-background-check/index.ts` — courier-invoked; candidate + invitation.
- `supabase/functions/checkr-webhook/index.ts` — public; verifies signature, maps events → status.
- `supabase/functions/adjudicate-background-check/index.ts` — admin-invoked; approve/deny a `consider`.

**Edge functions (modify):**
- `supabase/functions/accept-delivery-request/index.ts` — new gate.

**Edge functions (delete):**
- `supabase/functions/review-verification/index.ts`

**Client (modify):**
- `src/pages/courier/CourierVerify.jsx` — selfie uploader + start-check button.
- `src/pages/courier/CourierHome.jsx` — gate + banners off background_check_status.
- `src/pages/courier/CourierProfile.jsx` — verification section off background_check_status.
- `src/pages/admin/AdminVerifications.jsx` — `consider` review queue.

**Tests (create):**
- `supabase/functions/_shared/checkr.test.ts` — signature verification + status mapping (run with Deno if available; otherwise a Node/vitest port — see Task 3).
- `src/pages/courier/__tests__/gate.test.js` — accept-gate truth table (pure helper).

---

## Task 1: Schema migration — profiles reshape, drops, dead-letter

**Files:**
- Create: `supabase/migrations/20260723000002_courier_verification_redesign.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Courier verification redesign. Replaces the manual 3-doc review with
-- selfie + Connect KYC + Checkr background check. Drops the old
-- verification_status/documents model. Adds an email-allowlist admin
-- bootstrap and a webhook dead-letter table.

-- 1. New background-check status enum on profiles.
create type background_check_status_enum as enum
  ('not_started', 'pending', 'clear', 'consider', 'rejected');

alter table public.profiles
  add column if not exists selfie_path text,
  add column if not exists background_check_status background_check_status_enum
    not null default 'not_started',
  add column if not exists checkr_candidate_id text,
  add column if not exists checkr_report_id text,
  add column if not exists checkr_invitation_id text,
  add column if not exists background_check_updated_at timestamptz,
  add column if not exists background_check_notes text,
  add column if not exists background_check_reviewed_by uuid references auth.users(id),
  add column if not exists background_check_reviewed_at timestamptz;

-- 2. Remove the old manual-review model. review-verification edge fn is
--    deleted separately. The admin-reads-all-profiles policy from the old
--    migration stays (still used by the consider queue).
drop table if exists public.verification_documents;

alter table public.profiles
  drop column if exists verification_status,
  drop column if exists verification_submitted_at,
  drop column if exists verification_reviewed_at,
  drop column if exists verification_reviewer_id,
  drop column if exists verification_notes;

drop type if exists verification_status_enum;
drop type if exists verification_doc_type;

-- 3. Webhook dead-letter: events we couldn't match to a profile.
create table if not exists public.checkr_webhook_deadletter (
  id bigserial primary key,
  event_type text,
  candidate_id text,
  payload jsonb,
  reason text,
  created_at timestamptz default now()
);

alter table public.checkr_webhook_deadletter enable row level security;
create policy "service_role manages checkr deadletter"
  on public.checkr_webhook_deadletter
  for all to service_role using (true) with check (true);
```

- [ ] **Step 2: Verify it applies against a shadow/remote DB**

Run: `supabase db push --dry-run`
Expected: lists `20260723000002_courier_verification_redesign.sql` as pending, no SQL errors. (Do NOT push yet — deploy is a later, gated task.)

- [ ] **Step 3: Commit**

```bash
cd ~/Spetza && git add supabase/migrations/20260723000002_courier_verification_redesign.sql
git commit -m "feat(db): courier verification redesign schema — background_check columns, drop old model"
```

---

## Task 2: Admin bootstrap — allowlist + trigger

**Files:**
- Modify: `supabase/migrations/20260723000002_courier_verification_redesign.sql`

- [ ] **Step 1: Append the allowlist + trigger to the migration**

Add to the end of `20260723000002_courier_verification_redesign.sql`:

```sql
-- 4. Admin bootstrap that survives user wipes. The allowlist is a
--    separate table, so clearing auth.users never removes it. A BEFORE
--    trigger sets is_admin from the row's auth email.
create table if not exists public.admin_allowlist (
  email text primary key
);

-- Seed the operator. Replace with the real admin email at apply time.
insert into public.admin_allowlist (email)
values ('rooblix2000@gmail.com')
on conflict (email) do nothing;

create or replace function public.apply_admin_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = new.id;
  if v_email is not null
     and exists (select 1 from public.admin_allowlist a where a.email = v_email) then
    new.is_admin := true;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_apply_admin_allowlist on public.profiles;
create trigger profiles_apply_admin_allowlist
  before insert or update on public.profiles
  for each row execute function public.apply_admin_allowlist();
```

- [ ] **Step 2: Verify SQL parses**

Run: `supabase db push --dry-run`
Expected: still lists only the one migration, no errors.

- [ ] **Step 3: Commit**

```bash
cd ~/Spetza && git add supabase/migrations/20260723000002_courier_verification_redesign.sql
git commit -m "feat(db): email-allowlist admin bootstrap trigger (survives user wipes)"
```

---

## Task 3: Checkr shared helper + signature verification

**Files:**
- Create: `supabase/functions/_shared/checkr.ts`
- Create: `supabase/functions/_shared/checkr.test.ts`

- [ ] **Step 1: Write the failing test**

`supabase/functions/_shared/checkr.test.ts` (Deno test; also runnable logic-only):

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { verifySignature, statusForEvent } from "./checkr.ts";

Deno.test("verifySignature accepts a correct HMAC-SHA256 hex", async () => {
  const key = "test_key";
  const body = '{"type":"report.completed"}';
  // Precomputed HMAC-SHA256 hex of body with key "test_key":
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(body));
  const hex = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  assertEquals(await verifySignature(body, hex, key), true);
  assertEquals(await verifySignature(body, "deadbeef", key), false);
});

Deno.test("statusForEvent maps Checkr events to app status", () => {
  assertEquals(statusForEvent("report.created", null), "pending");
  assertEquals(statusForEvent("report.completed", "clear"), "clear");
  assertEquals(statusForEvent("report.completed", "consider"), "consider");
  assertEquals(statusForEvent("report.suspended", null), "pending");
  assertEquals(statusForEvent("candidate.created", null), null); // ignored
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `deno test supabase/functions/_shared/checkr.test.ts`
Expected: FAIL — `Cannot find module "./checkr.ts"`. (If `deno` is not installed, note it and rely on the manual sandbox E2E in Task 12; the helper is still written to this spec.)

- [ ] **Step 3: Implement the helper**

`supabase/functions/_shared/checkr.ts`:

```ts
// Checkr REST helpers + webhook signature verification. Checkr auth is
// HTTP Basic with the API key as username and an empty password.

const CHECKR_API = "https://api.checkr.com/v1";
const API_KEY = Deno.env.get("CHECKR_API_KEY") ?? "";
const PACKAGE = Deno.env.get("CHECKR_PACKAGE_SLUG") ?? "";

function authHeader(): string {
  return "Basic " + btoa(`${API_KEY}:`);
}

export type AppBgStatus = "pending" | "clear" | "consider" | "rejected";

// Map a Checkr webhook event + report status to our app status.
// Returns null for events we ignore.
export function statusForEvent(
  eventType: string,
  reportStatus: string | null,
): AppBgStatus | null {
  if (eventType === "report.created") return "pending";
  if (eventType === "report.suspended") return "pending";
  if (eventType === "report.completed") {
    if (reportStatus === "clear") return "clear";
    if (reportStatus === "consider") return "consider";
    return "pending";
  }
  return null;
}

// Constant-time-ish HMAC-SHA256 hex comparison.
export async function verifySignature(
  rawBody: string,
  signatureHex: string,
  key = API_KEY,
): Promise<boolean> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(rawBody));
  const computed = [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  if (computed.length !== signatureHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ signatureHex.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function createCandidate(userId: string, email: string): Promise<string> {
  const res = await fetch(`${CHECKR_API}/candidates`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, custom_id: userId }),
  });
  if (!res.ok) throw new Error(`checkr candidate create failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.id as string;
}

export async function createInvitation(candidateId: string): Promise<{ id: string; url: string }> {
  const res = await fetch(`${CHECKR_API}/invitations`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ candidate_id: candidateId, package: PACKAGE }),
  });
  if (!res.ok) throw new Error(`checkr invitation create failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { id: data.id as string, url: data.invitation_url as string };
}

// Trigger Checkr's Adverse Action workflow (sends the FCRA pre-adverse +
// adverse-action notices and runs the waiting period).
export async function startAdverseAction(reportId: string): Promise<void> {
  const res = await fetch(`${CHECKR_API}/reports/${reportId}/adverse_actions`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({}),
  });
  if (!res.ok) throw new Error(`checkr adverse action failed: ${res.status} ${await res.text()}`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `deno test supabase/functions/_shared/checkr.test.ts`
Expected: PASS (both tests). If `deno` unavailable, skip and record in the PR that helper tests run at deploy time in CI/manual.

- [ ] **Step 5: Commit**

```bash
cd ~/Spetza && git add supabase/functions/_shared/checkr.ts supabase/functions/_shared/checkr.test.ts
git commit -m "feat(edge): Checkr helper — candidate/invitation/adverse-action + HMAC signature verify"
```

---

## Task 4: `start-background-check` edge function

**Files:**
- Create: `supabase/functions/start-background-check/index.ts`

- [ ] **Step 1: Implement**

`supabase/functions/start-background-check/index.ts`:

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createCandidate, createInvitation } from "../_shared/checkr.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const COURIER_PAYS = (Deno.env.get("COURIER_PAYS_BACKGROUND_CHECK") ?? "false") === "true";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "missing auth" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const token = auth.replace("Bearer ", "");
  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return json({ error: "unauthenticated" }, 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type, selfie_path, stripe_connect_payouts_enabled, background_check_status, checkr_candidate_id")
    .eq("id", user.id)
    .single();

  if (profile?.account_type !== "courier") return json({ error: "only couriers" }, 403);
  if (!profile.selfie_path) return json({ error: "upload a selfie first" }, 409);
  if (!profile.stripe_connect_payouts_enabled) return json({ error: "finish payout setup first" }, 409);
  if (profile.background_check_status === "clear") return json({ error: "already cleared" }, 409);

  // COURIER_PAYS off-ramp (default off): when on, a successful Stripe
  // charge must precede invitation creation. Left as a guarded stub so
  // flipping the flag is a config change, not a rearchitecture.
  if (COURIER_PAYS) {
    return json({ error: "courier-pays flow not yet enabled" }, 501);
  }

  try {
    let candidateId = profile.checkr_candidate_id;
    if (!candidateId) {
      candidateId = await createCandidate(user.id, user.email ?? "");
      // Store candidate id SYNCHRONOUSLY before creating the invitation,
      // so a fast webhook can always match this profile.
      await supabase.from("profiles")
        .update({ checkr_candidate_id: candidateId })
        .eq("id", user.id);
    }
    const invitation = await createInvitation(candidateId);
    await supabase.from("profiles").update({
      checkr_invitation_id: invitation.id,
      background_check_status: "pending",
      background_check_updated_at: new Date().toISOString(),
    }).eq("id", user.id);
    return json({ invitation_url: invitation.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("start-background-check failed:", msg);
    return json({ error: "could not start background check, try again" }, 502);
  }
});
```

- [ ] **Step 2: Verify import resolves (static check)**

Run: `grep -n "_shared/checkr.ts" supabase/functions/start-background-check/index.ts`
Expected: shows the import line. (Full type-check happens at deploy in Task 12; Deno may not be local.)

- [ ] **Step 3: Commit**

```bash
cd ~/Spetza && git add supabase/functions/start-background-check/index.ts
git commit -m "feat(edge): start-background-check — candidate + Hosted Apply invitation (resumable)"
```

---

## Task 5: `checkr-webhook` edge function

**Files:**
- Create: `supabase/functions/checkr-webhook/index.ts`

- [ ] **Step 1: Implement**

`supabase/functions/checkr-webhook/index.ts`:

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifySignature, statusForEvent } from "../_shared/checkr.ts";

// Terminal states an admin owns — a late/duplicate webhook must never
// overwrite them.
const TERMINAL = new Set(["clear", "rejected"]);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const raw = await req.text();
  const sig = req.headers.get("X-Checkr-Signature") ?? "";
  if (!(await verifySignature(raw, sig))) {
    return new Response("bad signature", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let evt: any;
  try { evt = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  const eventType: string = evt?.type ?? "";
  const obj = evt?.data?.object ?? {};
  const candidateId: string | null = obj?.candidate_id ?? null;
  const reportStatus: string | null = obj?.status ?? null;
  const reportId: string | null = obj?.id ?? null;

  const nextStatus = statusForEvent(eventType, reportStatus);
  if (!nextStatus) return new Response("ignored", { status: 200 });

  if (!candidateId) {
    await supabase.from("checkr_webhook_deadletter").insert({
      event_type: eventType, candidate_id: null, payload: evt, reason: "no candidate_id",
    });
    return new Response("no candidate", { status: 200 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, background_check_status")
    .eq("checkr_candidate_id", candidateId)
    .single();

  if (!profile) {
    await supabase.from("checkr_webhook_deadletter").insert({
      event_type: eventType, candidate_id: candidateId, payload: evt, reason: "profile not found",
    });
    return new Response("no profile", { status: 200 });
  }

  // Guard: never downgrade a terminal admin-owned state.
  if (TERMINAL.has(profile.background_check_status)) {
    return new Response("terminal, ignored", { status: 200 });
  }

  const update: Record<string, unknown> = {
    background_check_status: nextStatus,
    background_check_updated_at: new Date().toISOString(),
  };
  if (reportId) update.checkr_report_id = reportId;

  const { error } = await supabase.from("profiles").update(update).eq("id", profile.id);
  if (error) {
    // Let Checkr retry a bounded number of times, then it dead-letters
    // on its side; surface non-2xx.
    return new Response("db error", { status: 500 });
  }
  return new Response("ok", { status: 200 });
});
```

- [ ] **Step 2: Note — webhook must be public (no JWT)**

Add a note to the deploy task: deploy with `--no-verify-jwt` so Checkr can reach it. Record here so Task 12 includes it.

- [ ] **Step 3: Commit**

```bash
cd ~/Spetza && git add supabase/functions/checkr-webhook/index.ts
git commit -m "feat(edge): checkr-webhook — signature verify, status mapping, terminal-state guard, dead-letter"
```

---

## Task 6: `adjudicate-background-check` edge function

**Files:**
- Create: `supabase/functions/adjudicate-background-check/index.ts`

- [ ] **Step 1: Implement**

`supabase/functions/adjudicate-background-check/index.ts`:

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { startAdverseAction } from "../_shared/checkr.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "missing auth" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const token = auth.replace("Bearer ", "");
  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return json({ error: "unauthenticated" }, 401);

  const { data: reviewer } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  if (!reviewer?.is_admin) return json({ error: "admin only" }, 403);

  const { courier_id, decision, notes } = await req.json().catch(() => ({}));
  if (!courier_id) return json({ error: "missing courier_id" }, 400);
  if (decision !== "approved" && decision !== "rejected") {
    return json({ error: "decision must be approved or rejected" }, 400);
  }
  if (decision === "rejected" && (!notes || !String(notes).trim())) {
    return json({ error: "notes required to reject" }, 400);
  }

  const { data: courier } = await supabase
    .from("profiles")
    .select("background_check_status, checkr_report_id")
    .eq("id", courier_id).single();
  if (!courier) return json({ error: "courier not found" }, 404);
  if (courier.background_check_status !== "consider") {
    return json({ error: `not in consider (status=${courier.background_check_status})` }, 409);
  }

  if (decision === "rejected") {
    if (!courier.checkr_report_id) return json({ error: "no report on record" }, 409);
    try {
      await startAdverseAction(courier.checkr_report_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: `adverse action failed: ${msg}` }, 502);
    }
  }

  const { error } = await supabase.from("profiles").update({
    background_check_status: decision === "approved" ? "clear" : "rejected",
    background_check_notes: notes ? String(notes).trim() : null,
    background_check_reviewed_by: user.id,
    background_check_reviewed_at: new Date().toISOString(),
    background_check_updated_at: new Date().toISOString(),
  }).eq("id", courier_id);
  if (error) return json({ error: error.message }, 500);

  return json({ courier_id, decision });
});
```

- [ ] **Step 2: Verify import resolves**

Run: `grep -n "startAdverseAction" supabase/functions/adjudicate-background-check/index.ts`
Expected: shows import + call.

- [ ] **Step 3: Commit**

```bash
cd ~/Spetza && git add supabase/functions/adjudicate-background-check/index.ts
git commit -m "feat(edge): adjudicate-background-check — admin approve/deny with FCRA adverse action"
```

---

## Task 7: Update accept gate; delete review-verification

**Files:**
- Modify: `supabase/functions/accept-delivery-request/index.ts`
- Delete: `supabase/functions/review-verification/index.ts`

- [ ] **Step 1: Replace the courier eligibility check**

In `accept-delivery-request/index.ts`, replace the courier select + checks (currently selecting `account_type, verification_status, stripe_connect_*`) with:

```ts
  // Courier (caller) must have a selfie, Connect payouts, and a clear check.
  const { data: courier } = await supabase
    .from("profiles")
    .select("account_type, selfie_path, background_check_status, stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled")
    .eq("id", user.id)
    .single();
  if (courier?.account_type !== "courier") return json({ error: "only couriers can accept" }, 403);
  if (!courier.selfie_path) return json({ error: "add a selfie first" }, 409);
  if (courier.background_check_status !== "clear") {
    return json({ error: "background check not clear" }, 403);
  }
  if (
    !courier.stripe_connect_account_id ||
    !courier.stripe_connect_charges_enabled ||
    !courier.stripe_connect_payouts_enabled
  ) {
    return json({ error: "courier payouts not set up" }, 409);
  }
```

- [ ] **Step 2: Delete the obsolete review function**

```bash
cd ~/Spetza && git rm -r supabase/functions/review-verification
```

- [ ] **Step 3: Verify no lingering references**

Run: `grep -rn "verification_status\|review-verification\|verification_documents" supabase/functions/`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
cd ~/Spetza && git add supabase/functions/accept-delivery-request/index.ts
git commit -m "feat(edge): accept gate = selfie + payouts + background clear; remove review-verification"
```

---

## Task 8: Accept-gate helper + truth-table test (client)

**Files:**
- Create: `src/lib/courierGate.js`
- Create: `src/pages/courier/__tests__/gate.test.js`

- [ ] **Step 1: Write the failing test**

`src/pages/courier/__tests__/gate.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { canAcceptDeliveries, courierStep } from '../../../lib/courierGate.js'

const base = {
  selfie_path: 'u/selfie.jpg',
  background_check_status: 'clear',
  stripe_connect_charges_enabled: true,
  stripe_connect_payouts_enabled: true,
}

describe('canAcceptDeliveries', () => {
  it('allows only when all three pass', () => {
    expect(canAcceptDeliveries(base)).toBe(true)
  })
  it('blocks without a selfie', () => {
    expect(canAcceptDeliveries({ ...base, selfie_path: null })).toBe(false)
  })
  it('blocks when background not clear', () => {
    expect(canAcceptDeliveries({ ...base, background_check_status: 'pending' })).toBe(false)
    expect(canAcceptDeliveries({ ...base, background_check_status: 'consider' })).toBe(false)
  })
  it('blocks without payouts', () => {
    expect(canAcceptDeliveries({ ...base, stripe_connect_payouts_enabled: false })).toBe(false)
  })
})

describe('courierStep', () => {
  it('returns the next incomplete step', () => {
    expect(courierStep({ ...base, selfie_path: null })).toBe('selfie')
    expect(courierStep({ ...base, stripe_connect_payouts_enabled: false })).toBe('payouts')
    expect(courierStep({ ...base, background_check_status: 'not_started' })).toBe('background')
    expect(courierStep(base)).toBe('done')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/Spetza && npm test -- src/pages/courier/__tests__/gate.test.js`
Expected: FAIL — cannot find `courierGate.js`.

- [ ] **Step 3: Implement**

`src/lib/courierGate.js`:

```js
// Single source of truth for the courier accept gate, mirrored in
// accept-delivery-request. Keep the two in sync.
export function canAcceptDeliveries(p) {
  return (
    !!p?.selfie_path &&
    p?.background_check_status === 'clear' &&
    !!p?.stripe_connect_charges_enabled &&
    !!p?.stripe_connect_payouts_enabled
  )
}

// The next onboarding step a courier still needs, in order.
export function courierStep(p) {
  if (!p?.selfie_path) return 'selfie'
  if (!p?.stripe_connect_payouts_enabled || !p?.stripe_connect_charges_enabled) return 'payouts'
  if (p?.background_check_status !== 'clear') return 'background'
  return 'done'
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd ~/Spetza && npm test -- src/pages/courier/__tests__/gate.test.js`
Expected: PASS (8 assertions).

- [ ] **Step 5: Commit**

```bash
cd ~/Spetza && git add src/lib/courierGate.js src/pages/courier/__tests__/gate.test.js
git commit -m "feat: courier accept-gate helper + truth-table tests"
```

---

## Task 9: Rewrite CourierVerify (selfie + start check)

**Files:**
- Modify: `src/pages/courier/CourierVerify.jsx`

- [ ] **Step 1: Replace the page**

Replace the whole file with a selfie uploader + a background-check launcher driven by `background_check_status`:

```jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'

const MAX_BYTES = 5 * 1024 * 1024
const BUCKET = 'courier-verification'

export default function CourierVerify() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [uploading, setUploading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [selfiePath, setSelfiePath] = useState(profile?.selfie_path ?? null)

  useEffect(() => {
    setSelfiePath(profile?.selfie_path ?? null)
  }, [profile?.selfie_path])

  const bg = profile?.background_check_status ?? 'not_started'
  const payoutsReady =
    profile?.stripe_connect_charges_enabled && profile?.stripe_connect_payouts_enabled

  const onSelfie = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (!file.type.startsWith('image/')) { toast.error('Pick an image file.'); return }
    if (file.size > MAX_BYTES) { toast.error('Image must be under 5 MB.'); return }
    setUploading(true)
    const ext = file.name.split('.').pop() || 'jpg'
    const objectPath = `${user.id}/selfie-${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from(BUCKET).upload(objectPath, file, { contentType: file.type })
    if (upErr) { setUploading(false); toast.error(upErr.message); return }
    const previous = selfiePath
    const { error: dbErr } = await supabase
      .from('profiles').update({ selfie_path: objectPath }).eq('id', user.id)
    setUploading(false)
    if (dbErr) {
      toast.error(dbErr.message)
      await supabase.storage.from(BUCKET).remove([objectPath])
      return
    }
    setSelfiePath(objectPath)
    if (previous) await supabase.storage.from(BUCKET).remove([previous])
    await refreshProfile()
  }

  const startCheck = async () => {
    setStarting(true)
    const { data, error } = await supabase.functions.invoke('start-background-check')
    setStarting(false)
    if (error) { toast.error(error.message); return }
    if (data?.invitation_url) {
      window.location.href = data.invitation_url
    } else {
      toast.error('Could not start the check. Try again.')
    }
  }

  if (!hasSupabaseConfig) {
    return <div className="min-h-full px-6 py-12 max-w-xl mx-auto text-slate">Supabase not configured.</div>
  }

  return (
    <div className="min-h-full px-6 py-12 max-w-xl mx-auto">
      <div className="text-xs uppercase tracking-widest text-signal">Courier</div>
      <h1 className="font-serif text-3xl text-ink mt-1">Get verified</h1>
      <p className="text-slate mt-3">
        Three quick steps: a selfie, your payout account, and a background check.
      </p>

      {/* Step 1: selfie */}
      <section className="mt-8 p-4 rounded-xl border border-mist bg-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-ink text-sm">1 · Selfie</div>
            <div className="text-slate text-xs mt-0.5">A clear, face-on photo. Recipients see this.</div>
          </div>
          {selfiePath && <span className="text-xs text-forest">Uploaded ✓</span>}
        </div>
        <label className="mt-3 block px-4 py-3 rounded-lg border-2 border-dashed border-mist text-center text-sm text-slate hover:border-signal hover:text-ink cursor-pointer">
          {uploading ? 'Uploading…' : selfiePath ? 'Replace selfie' : 'Tap to upload (up to 5 MB)'}
          <input type="file" accept="image/*" onChange={onSelfie} disabled={uploading} className="hidden" />
        </label>
      </section>

      {/* Step 2: payouts (link to profile where CourierConnectSection lives) */}
      <section className="mt-4 p-4 rounded-xl border border-mist bg-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-ink text-sm">2 · Payout account</div>
            <div className="text-slate text-xs mt-0.5">Set up Stripe to get paid. This also verifies your identity.</div>
          </div>
          {payoutsReady
            ? <span className="text-xs text-forest">Connected ✓</span>
            : <button onClick={() => navigate('/courier/profile')} className="text-xs text-signal hover:underline">Set up →</button>}
        </div>
      </section>

      {/* Step 3: background check */}
      <section className="mt-4 p-4 rounded-xl border border-mist bg-white">
        <div className="text-ink text-sm">3 · Background check</div>
        {bg === 'clear' ? (
          <div className="mt-2 p-3 rounded-lg bg-forest/10 text-forest text-sm">Cleared ✓ You can accept deliveries.</div>
        ) : bg === 'pending' ? (
          <div className="mt-2 p-3 rounded-lg bg-signal/10 text-signal text-sm">In progress. We'll update this when it's done.</div>
        ) : bg === 'consider' ? (
          <div className="mt-2 p-3 rounded-lg bg-signal/10 text-signal text-sm">Under review. We'll be in touch.</div>
        ) : bg === 'rejected' ? (
          <div className="mt-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">Not approved. Check your email from Checkr for details.</div>
        ) : (
          <>
            <div className="text-slate text-xs mt-0.5">Runs through Checkr. Free to you.</div>
            <button
              onClick={startCheck}
              disabled={!selfiePath || !payoutsReady || starting}
              className="mt-3 w-full px-4 py-3 rounded-lg bg-forest text-cream text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {starting ? 'Starting…' : 'Start background check'}
            </button>
            {(!selfiePath || !payoutsReady) && (
              <div className="text-xs text-slate mt-2">Finish steps 1 and 2 first.</div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `cd ~/Spetza && npm run build 2>&1 | tail -3`
Expected: `✓ built` with no errors.

- [ ] **Step 3: Commit**

```bash
cd ~/Spetza && git add src/pages/courier/CourierVerify.jsx
git commit -m "feat: CourierVerify — selfie upload + Checkr background-check launcher"
```

---

## Task 10: Update CourierHome + CourierProfile

**Files:**
- Modify: `src/pages/courier/CourierHome.jsx`
- Modify: `src/pages/courier/CourierProfile.jsx`

- [ ] **Step 1: CourierHome — swap gate logic to the helper**

At the top of `CourierHome.jsx`, add:

```jsx
import { canAcceptDeliveries, courierStep } from '../../lib/courierGate.js'
```

Replace the accept-error copy map entry (line ~29) so it no longer says "ID verification":

```jsx
  'courier not approved': "Finish getting verified before you can accept.",
  'background check not clear': "Your background check isn't clear yet.",
  'add a selfie first': 'Add a selfie before you can accept.',
```

Replace the verification banner block (the `profile?.verification_status !== 'approved'` block, ~lines 236–268) with a step-driven banner:

```jsx
        {courierStep(profile) !== 'done' && (
          <div className="mb-4 p-4 rounded-xl border border-mist bg-white">
            <div className="text-sm text-ink font-medium">Finish getting verified</div>
            <div className="text-sm text-slate mt-1">
              {courierStep(profile) === 'selfie' && 'Upload a selfie to continue.'}
              {courierStep(profile) === 'payouts' && 'Set up your payout account.'}
              {courierStep(profile) === 'background' &&
                (profile?.background_check_status === 'pending'
                  ? 'Your background check is in progress.'
                  : profile?.background_check_status === 'consider'
                  ? 'Your background check is under review.'
                  : profile?.background_check_status === 'rejected'
                  ? 'Your background check was not approved.'
                  : 'Start your background check.')}
            </div>
            <button
              onClick={() => navigate('/courier/verify')}
              className="mt-3 px-4 py-2 rounded-lg bg-forest text-cream text-sm"
            >
              Continue verification
            </button>
          </div>
        )}
```

Replace the per-card `canAccept` computation (~lines 446–450) with:

```jsx
                const canAccept = canAcceptDeliveries(profile)
                const acceptHint = !canAcceptDeliveries(profile)
                  ? 'Finish verification to accept'
                  : null
```

(Adjust the surrounding JSX that referenced `payoutsReady`/`verification_status` to use `canAccept` and `acceptHint`.)

- [ ] **Step 2: CourierProfile — verification section off background_check_status**

In `CourierProfile.jsx`, replace the status label map (line ~25) and the `verificationStatus` read (line ~89):

```jsx
const BG_LABEL = {
  not_started: { label: 'Not started', tone: 'text-slate' },
  pending: { label: 'In progress', tone: 'text-signal' },
  consider: { label: 'Under review', tone: 'text-signal' },
  clear: { label: 'Verified ✓', tone: 'text-forest' },
  rejected: { label: 'Not approved', tone: 'text-red-600' },
}
```

```jsx
  const bgStatus = profile?.background_check_status ?? 'not_started'
```

Update the "Verification" section JSX to render `BG_LABEL[bgStatus]` and, when not `clear`, a link to `/courier/verify`.

- [ ] **Step 3: Build**

Run: `cd ~/Spetza && npm run build 2>&1 | tail -3`
Expected: `✓ built`, no errors.

- [ ] **Step 4: Commit**

```bash
cd ~/Spetza && git add src/pages/courier/CourierHome.jsx src/pages/courier/CourierProfile.jsx
git commit -m "feat: courier home + profile driven by background_check_status and the shared gate"
```

---

## Task 11: AdminVerifications → consider review queue

**Files:**
- Modify: `src/pages/admin/AdminVerifications.jsx`

- [ ] **Step 1: Replace the page**

Replace the whole file with a `consider`-only queue that deep-links to Checkr and calls `adjudicate-background-check`:

```jsx
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

const CHECKR_DASH = 'https://dashboard.checkr.com/candidates/'

export default function AdminVerifications() {
  const [couriers, setCouriers] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)

  const refresh = useCallback(async () => {
    if (!hasSupabaseConfig) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, checkr_candidate_id, checkr_report_id, background_check_updated_at')
      .eq('account_type', 'courier')
      .eq('background_check_status', 'consider')
      .order('background_check_updated_at', { ascending: true })
    setCouriers(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const decide = async (courier, decision) => {
    let notes = null
    if (decision === 'rejected') {
      notes = window.prompt('Reason (kept internal; Checkr sends the courier the FCRA notices):')
      if (notes == null) return
    }
    setActing(courier.id)
    const { error } = await supabase.functions.invoke('adjudicate-background-check', {
      body: { courier_id: courier.id, decision, notes },
    })
    setActing(null)
    if (error) { toast.error(error.message); return }
    toast.success(decision === 'approved' ? 'Cleared' : 'Rejected (adverse action started)')
    refresh()
  }

  return (
    <div className="min-h-full px-6 py-12 max-w-3xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-signal">Admin</div>
          <h1 className="font-serif text-3xl text-ink mt-1">Background checks — review</h1>
        </div>
        <Link to="/" className="text-sm text-slate hover:text-ink">Back</Link>
      </header>

      <div className="mt-10">
        {loading ? (
          <div className="text-slate">Loading…</div>
        ) : couriers.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-mist">
            <p className="text-slate">Nothing to review.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {couriers.map((c) => (
              <li key={c.id} className="p-5 rounded-xl border border-mist bg-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-ink font-medium">
                      {c.first_name || c.last_name
                        ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()
                        : 'Unnamed courier'}
                    </div>
                    <div className="text-xs text-slate mt-0.5">
                      Flagged {fmtDate(c.background_check_updated_at)}
                    </div>
                  </div>
                  {c.checkr_candidate_id && (
                    <a
                      href={`${CHECKR_DASH}${c.checkr_candidate_id}`}
                      target="_blank" rel="noreferrer"
                      className="text-xs text-signal hover:underline"
                    >
                      View report in Checkr ↗
                    </a>
                  )}
                </div>
                <div className="mt-5 flex gap-2 justify-end">
                  <button
                    onClick={() => decide(c, 'rejected')}
                    disabled={acting === c.id}
                    className="px-3 py-1.5 rounded-lg border border-mist text-sm text-slate hover:border-red-500 hover:text-red-600 disabled:opacity-50"
                  >
                    Deny
                  </button>
                  <button
                    onClick={() => decide(c, 'approved')}
                    disabled={acting === c.id}
                    className="px-3 py-1.5 rounded-lg bg-forest text-cream text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    Approve
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `cd ~/Spetza && npm run build 2>&1 | tail -3`
Expected: `✓ built`, no errors.

- [ ] **Step 3: Commit**

```bash
cd ~/Spetza && git add src/pages/admin/AdminVerifications.jsx
git commit -m "feat: admin page reviews Checkr consider reports (deep-link, approve/deny)"
```

---

## Task 12: Deploy + sandbox E2E (gated — needs user go-ahead)

**Files:** none (deploy + verification only)

- [ ] **Step 1: Set Checkr + config secrets**

```bash
cd ~/Spetza && supabase secrets set CHECKR_API_KEY=<staging_api_key> CHECKR_PACKAGE_SLUG=<criminal_only_package_slug> COURIER_PAYS_BACKGROUND_CHECK=false
```
Expected: `Finished supabase secrets set.`

- [ ] **Step 2: Confirm the admin_allowlist email**

Before pushing, confirm the seeded email in the migration is the operator's real admin email (`rooblix2000@gmail.com`); change it if needed.

- [ ] **Step 3: Push the migration**

```bash
cd ~/Spetza && supabase db push
```
Expected: applies `20260723000002_courier_verification_redesign.sql` only.

- [ ] **Step 4: Deploy the functions (webhook is public)**

```bash
cd ~/Spetza && supabase functions deploy start-background-check \
  && supabase functions deploy adjudicate-background-check \
  && supabase functions deploy accept-delivery-request \
  && supabase functions deploy checkr-webhook --no-verify-jwt
```
Expected: all four deploy; `checkr-webhook` deployed with `--no-verify-jwt`.

- [ ] **Step 5: Register the webhook URL in Checkr**

In the Checkr dashboard (staging), add a webhook subscription pointing at
`https://<project-ref>.functions.supabase.co/checkr-webhook`. Save.

- [ ] **Step 6: Sandbox E2E — clear path**

1. Sign up as a courier, upload a selfie, finish Connect (test), tap Start background check.
2. Complete the Checkr Hosted Apply flow with a **`clear`** test candidate.
3. Confirm the webhook flips `background_check_status` to `clear` (check the profile row).
4. Confirm the courier can now accept a delivery.

Expected: status → `clear`, accept enabled.

- [ ] **Step 7: Sandbox E2E — consider path**

1. Repeat with a **`consider`** test candidate.
2. Confirm status → `consider`, courier still gated.
3. As the admin (allowlisted email), open `/admin`, click Approve.
4. Confirm status → `clear` and accept enabled.

Expected: consider → admin approve → clear.

- [ ] **Step 8: Push client + wrap**

```bash
cd ~/Spetza && git push origin main
```
Expected: Netlify redeploys the client.

---

## Self-Review

**Spec coverage:**
- Selfie upload → Task 9 ✓
- Connect KYC as identity (unchanged) → gate in Tasks 7/8 ✓
- Checkr Hosted Apply → Tasks 3/4 ✓
- Accept gate (selfie + payouts + clear) → Tasks 7/8 ✓
- Remove verification_status + verification_documents + review-verification → Tasks 1/7 ✓
- background_check_status enum + Checkr columns → Task 1 ✓
- admin_allowlist bootstrap trigger → Task 2 ✓
- COURIER_PAYS off-ramp (default off, guarded stub) → Task 4 ✓
- checkr-webhook signature verify + status map + terminal guard + dead-letter → Task 5 ✓
- adjudicate + FCRA adverse action on deny → Task 6 ✓
- consider review UI (deep-link, no PII in Spetza) → Task 11 ✓
- deadletter table → Task 1 ✓
- Testing (signature, status map, gate truth table, sandbox E2E) → Tasks 3/8/12 ✓

**Placeholder scan:** No TBD/TODO. The COURIER_PAYS charge is an intentional guarded `501` stub per spec ("built as a toggle but launches false"), not a placeholder — the flag path is fully defined.

**Type/name consistency:** `background_check_status` values (`not_started|pending|clear|consider|rejected`) are identical across migration, `statusForEvent`, edge functions, `courierGate.js`, and UI. `checkr_candidate_id` / `checkr_report_id` / `checkr_invitation_id` consistent. `canAcceptDeliveries` / `courierStep` names match between helper and consumers.

**One noted gap for the implementer:** Task 10 edits CourierHome around specific line numbers that will shift as edits land — the implementer should locate the `verification_status` references by search, not line number, and remove every one (verified by the Task 7 Step 3 grep pattern extended to `src/`).
