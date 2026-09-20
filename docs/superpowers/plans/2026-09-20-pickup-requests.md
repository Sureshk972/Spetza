# Pickup Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A requester can ask a courier to collect something from a named person or business and bring it to them, with the handover verified by a PIN texted to that person.

**Architecture:** One new `kind` column on `delivery_requests` (`send` | `pickup`) plus a sender/courier-only `delivery_pickup_contacts` table. The existing status machine, pricing, payment and PIN machinery are untouched; pickup mode changes who receives the PIN text (the contact instead of the requester) and requires the courier to photograph the item before the PIN is accepted. Pure rules live in small testable modules; pages and edge functions call them.

**Tech Stack:** React 18 + Vite + Tailwind (JSX), Supabase (Postgres/RLS, edge functions on Deno), Twilio SMS via `_shared/sms.ts`. Tests: vitest (`npm test`) for `src/`, `npx deno@2 test supabase/functions` for edge code.

**Spec:** `docs/superpowers/specs/2026-09-20-pickup-requests-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20260920000001_pickup_requests.sql` | Create: enum, columns, contacts table, RLS |
| `src/lib/requestKind.js` | Create: kind labels, contact validation, requester-facing status copy |
| `src/lib/requestKind.test.js` | Create: tests for the above |
| `src/lib/proofUpload.js` | Create: upload one photo to `delivery-proof` (extracted from CourierDelivery) |
| `supabase/functions/_shared/pickupRules.ts` (+ `.test.ts`) | Create: photo-before-PIN rule |
| `supabase/functions/_shared/pickupContact.ts` (+ `.test.ts`) | Create: SMS copy for the pickup contact |
| `supabase/functions/_shared/sms.ts` | Modify: export `sendSms` |
| `supabase/functions/send-notification/index.ts` | Modify: text the contact on `accepted` / `arrived`, record `sms_status` |
| `supabase/functions/verify-pickup-pin/index.ts` | Modify: enforce photo-before-PIN |
| `supabase/functions/report-delivery/index.ts` | Modify: accept `nobody_there` |
| `src/pages/sender/NewRequest.jsx` | Modify: mode switch, contact fields, conditional photo, two-step insert |
| `src/pages/sender/EditRequest.jsx` | Modify: same fields editable while open |
| `src/pages/sender/RequestDetail.jsx` | Modify: contact block, PIN/text status, pickup photo |
| `src/pages/courier/CourierDelivery.jsx` | Modify: Pickup tag, contact card, photo step, report reason |
| `src/pages/courier/CourierHome.jsx` | Modify: Pickup tag on cards |
| `docs/a2p-10dlc-campaign-copy.md`, `src/pages/Terms.jsx` | Modify: one line each on texting a named contact |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260920000001_pickup_requests.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Pickup requests: the requester asks a courier to collect something from a
-- named person or business and bring it to them. The requester is at the
-- dropoff, so the pickup PIN goes to the contact by SMS instead of being
-- shown to the requester, and the courier photographs the item at pickup
-- since the requester never saw it.

create type request_kind as enum ('send', 'pickup');

alter table public.delivery_requests
  add column if not exists kind request_kind not null default 'send',
  add column if not exists pickup_photo_path text;

comment on column public.delivery_requests.kind is
  'send: requester hands the package over at pickup. pickup: a named contact '
  'hands it over and the requester receives it at dropoff.';
comment on column public.delivery_requests.pickup_photo_path is
  'Object path in the delivery-proof bucket, taken by the courier at pickup. '
  'Required before verify-pickup-pin accepts a PIN on a pickup-kind request. '
  'Same <delivery_request_id>/<uuid>.<ext> convention as delivery_photo_path, '
  'so the existing storage policies cover it.';

-- Who hands the package over. Kept off delivery_requests so the courier pool
-- (which can read every open row) never sees a private person's phone.
create table if not exists public.delivery_pickup_contacts (
  delivery_request_id uuid primary key references public.delivery_requests(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  phone text not null check (phone ~ '^\+1[0-9]{10}$'),
  sms_status text not null default 'pending' check (sms_status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default now()
);

alter table public.delivery_pickup_contacts enable row level security;

-- Requester always; courier only once assigned.
create policy "delivery parties read pickup contact"
  on public.delivery_pickup_contacts for select
  using (
    exists (
      select 1 from public.delivery_requests dr
      where dr.id = delivery_request_id
        and (dr.sender_id = auth.uid() or dr.courier_id = auth.uid())
    )
  );

-- Requester writes only while the request is still open.
create policy "sender writes pickup contact while open"
  on public.delivery_pickup_contacts for all
  using (
    exists (
      select 1 from public.delivery_requests dr
      where dr.id = delivery_request_id
        and dr.sender_id = auth.uid()
        and dr.status = 'open'
    )
  )
  with check (
    exists (
      select 1 from public.delivery_requests dr
      where dr.id = delivery_request_id
        and dr.sender_id = auth.uid()
        and dr.status = 'open'
    )
  );

-- send-notification writes sms_status.
create policy "service_role manages pickup contacts"
  on public.delivery_pickup_contacts for all
  to service_role using (true) with check (true);
```

- [ ] **Step 2: Apply locally and check**

Run: `cd ~/Spetza && supabase db push --linked --dry-run`
Expected: lists `20260920000001_pickup_requests.sql` as pending, no errors.

Then (Suresh has not said "build and hold" for Spetza, so push is allowed): `supabase db push --linked`
Expected: `Applying migration 20260920000001_pickup_requests.sql... Finished supabase db push.`

Verify: `supabase db query --linked "select column_name from information_schema.columns where table_name='delivery_requests' and column_name in ('kind','pickup_photo_path')"`
Expected: two rows.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260920000001_pickup_requests.sql
git commit -m "Pickup requests: kind column, pickup photo, contacts table"
```

---

### Task 2: `requestKind.js` — labels, contact validation, status copy

**Files:**
- Create: `src/lib/requestKind.js`
- Test: `src/lib/requestKind.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from 'vitest'
import { REQUEST_KINDS, pickupContactError, contactStatusCopy } from './requestKind.js'

describe('REQUEST_KINDS', () => {
  it('offers send and pickup with the agreed labels', () => {
    expect(REQUEST_KINDS).toEqual([
      { value: 'send', label: 'Send something' },
      { value: 'pickup', label: 'Pick up something' },
    ])
  })
})

describe('pickupContactError', () => {
  it('returns null for a name and a US mobile', () => {
    expect(pickupContactError({ name: 'Joe', phone: '(312) 555-0100' })).toBeNull()
  })
  it('requires a name', () => {
    expect(pickupContactError({ name: '  ', phone: '3125550100' })).toBe('Who is handing it over?')
  })
  it('requires a 10-digit US number', () => {
    expect(pickupContactError({ name: 'Joe', phone: '555' })).toBe('Enter a 10-digit US mobile number.')
    expect(pickupContactError({ name: 'Joe', phone: '+447911123456' })).toBe('Enter a 10-digit US mobile number.')
  })
  it('caps the name at 80 characters', () => {
    expect(pickupContactError({ name: 'x'.repeat(81), phone: '3125550100' })).toBe('Name is too long.')
  })
})

describe('contactStatusCopy', () => {
  it('says the text went out', () => {
    expect(contactStatusCopy('Joe', 'sent')).toBe("We texted Joe the pickup PIN and your courier's name.")
  })
  it('says it is still sending', () => {
    expect(contactStatusCopy('Joe', 'pending')).toBe('Texting Joe…')
  })
  it('asks the requester to relay when the text failed', () => {
    expect(contactStatusCopy('Joe', 'failed')).toBe("The text to Joe didn't go through. Give Joe this PIN yourself.")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/Spetza && npx vitest run src/lib/requestKind.test.js`
Expected: FAIL — `Cannot find module './requestKind.js'`

- [ ] **Step 3: Implement**

```js
// Which way a delivery runs. `send` is the original flow: the requester is
// at the pickup and hands the package over. `pickup` reverses it: a named
// contact hands over and the requester waits at the dropoff.
import { normalizePhone } from './phone.js'

export const REQUEST_KINDS = [
  { value: 'send', label: 'Send something' },
  { value: 'pickup', label: 'Pick up something' },
]

// Returns a message to show, or null when the contact is usable.
// US mobiles only: the PIN goes out by SMS, and Twilio's A2P campaign is
// registered for US traffic.
export function pickupContactError({ name, phone }) {
  const trimmed = (name || '').trim()
  if (!trimmed) return 'Who is handing it over?'
  if (trimmed.length > 80) return 'Name is too long.'
  if (!/^\+1\d{10}$/.test(normalizePhone(phone))) return 'Enter a 10-digit US mobile number.'
  return null
}

// What the requester sees under "Pickup code" once a courier has accepted,
// keyed by delivery_pickup_contacts.sms_status.
export function contactStatusCopy(contactName, smsStatus) {
  if (smsStatus === 'sent') return `We texted ${contactName} the pickup PIN and your courier's name.`
  if (smsStatus === 'failed') return `The text to ${contactName} didn't go through. Give ${contactName} this PIN yourself.`
  return `Texting ${contactName}…`
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd ~/Spetza && npx vitest run src/lib/requestKind.test.js`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/requestKind.js src/lib/requestKind.test.js
git commit -m "Pickup requests: kind labels, contact validation, status copy"
```

---

### Task 3: Edge-side rules — photo before PIN, contact SMS copy

**Files:**
- Create: `supabase/functions/_shared/pickupRules.ts`, `supabase/functions/_shared/pickupRules.test.ts`
- Create: `supabase/functions/_shared/pickupContact.ts`, `supabase/functions/_shared/pickupContact.test.ts`

- [ ] **Step 1: Write the failing tests**

`pickupRules.test.ts`:
```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pickupBlockedReason } from "./pickupRules.ts";

Deno.test("send-kind requests never need a pickup photo", () => {
  assertEquals(pickupBlockedReason("send", null), null);
});

Deno.test("pickup-kind requests need the photo before the PIN", () => {
  assertEquals(pickupBlockedReason("pickup", null), "photo_required");
  assertEquals(pickupBlockedReason("pickup", ""), "photo_required");
  assertEquals(pickupBlockedReason("pickup", "abc/def.jpg"), null);
});
```

`pickupContact.test.ts`:
```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pickupContactSms } from "./pickupContact.ts";

const ctx = {
  orderNumber: "SPZ-00021",
  courierName: "Maria",
  requesterName: "Suresh",
  description: "Blue jacket",
  pin: "4821",
};

Deno.test("accepted: names both people, tells the contact what to check, gives the PIN", () => {
  assertEquals(
    pickupContactSms("accepted", ctx),
    "Spetza: Maria is picking up \"Blue jacket\" for Suresh. Before handing it over, ask to see the job on their phone — it shows SPZ-00021 and your name. Then give them PIN 4821. Reply STOP to opt out.",
  );
});

Deno.test("arrived: short heads-up", () => {
  assertEquals(pickupContactSms("arrived", ctx), "Spetza: Maria is outside for the pickup.");
});

Deno.test("other events: nothing to the contact", () => {
  assertEquals(pickupContactSms("picked_up", ctx), null);
  assertEquals(pickupContactSms("created", ctx), null);
});

Deno.test("missing names fall back without breaking the sentence", () => {
  assertEquals(
    pickupContactSms("arrived", { ...ctx, courierName: null }),
    "Spetza: Your courier is outside for the pickup.",
  );
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd ~/Spetza && npx deno@2 test supabase/functions/_shared/pickupRules.test.ts supabase/functions/_shared/pickupContact.test.ts`
Expected: errors — modules not found.

- [ ] **Step 3: Implement**

`pickupRules.ts`:
```ts
// Rules that only apply to pickup-kind requests. Kept out of the edge
// functions so they can be unit-tested without a Supabase client.

export type RequestKind = "send" | "pickup";

// The requester never saw the item, so the courier's photo at pickup is the
// only record of what was handed over. It has to exist before the PIN is
// accepted, or a courier standing at the door skips it every time.
export function pickupBlockedReason(
  kind: RequestKind | string | null,
  pickupPhotoPath: string | null,
): "photo_required" | null {
  if (kind !== "pickup") return null;
  if (!pickupPhotoPath) return "photo_required";
  return null;
}
```

`pickupContact.ts`:
```ts
// SMS copy for the person handing a package over on a pickup-kind request.
// They never signed up, so every message is short, says who Spetza is, and
// carries the STOP line the A2P campaign promises.

export interface PickupContactContext {
  orderNumber: string;
  courierName: string | null;
  requesterName: string | null;
  description: string;
  pin: string | null;
}

export function pickupContactSms(
  event: string,
  ctx: PickupContactContext,
): string | null {
  const courier = ctx.courierName || "Your courier";
  const requester = ctx.requesterName || "a Spetza customer";
  // "their"/"them": pronouns are not on the profile, and the contact only
  // needs to know whose phone to look at.
  if (event === "accepted") {
    return (
      `Spetza: ${courier} is picking up "${ctx.description}" for ${requester}. ` +
      `Before handing it over, ask to see the job on their phone — it shows ` +
      `${ctx.orderNumber} and your name. Then give them PIN ${ctx.pin ?? "----"}. ` +
      `Reply STOP to opt out.`
    );
  }
  if (event === "arrived") {
    return `Spetza: ${courier} is outside for the pickup.`;
  }
  return null;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd ~/Spetza && npx deno@2 test supabase/functions/_shared/pickupRules.test.ts supabase/functions/_shared/pickupContact.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/pickupRules.ts supabase/functions/_shared/pickupRules.test.ts supabase/functions/_shared/pickupContact.ts supabase/functions/_shared/pickupContact.test.ts
git commit -m "Pickup requests: photo-before-PIN rule and contact SMS copy"
```

---

### Task 4: `verify-pickup-pin` enforces the photo

**Files:**
- Modify: `supabase/functions/verify-pickup-pin/index.ts:44-58`

- [ ] **Step 1: Select the new columns and apply the rule**

Add the import at the top:
```ts
import { pickupBlockedReason } from "../_shared/pickupRules.ts";
```

Change the request select and add the check right after the status check:
```ts
  const { data: request, error: reqErr } = await supabase
    .from("delivery_requests")
    .select("id, courier_id, status, kind, pickup_photo_path")
    .eq("id", delivery_request_id)
    .single();

  if (reqErr || !request) {
    return json({ error: "request not found" }, 404);
  }
  if (request.courier_id !== user.id) {
    return json({ error: "not your delivery" }, 403);
  }
  if (request.status !== "accepted") {
    return json({ error: "delivery is not in accepted state" }, 409);
  }
  // Pickup-kind: the item photo is the requester's only look at what was
  // collected. The client hides the PIN field until it exists; this is the rule.
  const blocked = pickupBlockedReason(request.kind, request.pickup_photo_path);
  if (blocked) {
    return json({ error: "take a photo of the item before entering the PIN", code: blocked }, 409);
  }
```

- [ ] **Step 2: Type-check**

Run: `cd ~/Spetza && npx deno@2 check supabase/functions/verify-pickup-pin/index.ts`
Expected: no errors.

- [ ] **Step 3: Deploy and smoke**

Run: `cd ~/Spetza && supabase functions deploy verify-pickup-pin`
Expected: `Deployed Functions on project pdgtryghvibhmmroqvdk: verify-pickup-pin` (Spetza's ref may differ — read it from `supabase/config.toml`).

Smoke: `curl -s -X POST "$(supabase status 2>/dev/null | grep -o 'https://[a-z]*.supabase.co' | head -1)/functions/v1/verify-pickup-pin" -H "Content-Type: application/json" -d '{}'`
Expected: `{"error":"missing auth"}` — the function boots.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/verify-pickup-pin/index.ts
git commit -m "verify-pickup-pin: require the item photo on pickup requests"
```

---

### Task 5: `report-delivery` accepts "nobody there"

**Files:**
- Modify: `supabase/functions/report-delivery/index.ts:26-31`

- [ ] **Step 1: Add the reason**

```ts
const REASONS = new Set([
  "wrong_size",
  "too_heavy",
  "prohibited_item",
  "not_as_described",
  // Pickup-kind: the contact wasn't there or the item wasn't ready. Same
  // outcome as the others -- cancel, release the hold, file for review.
  "nobody_there",
]);
```

- [ ] **Step 2: Deploy**

Run: `cd ~/Spetza && npx deno@2 check supabase/functions/report-delivery/index.ts && supabase functions deploy report-delivery`
Expected: no type errors; deployed.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/report-delivery/index.ts
git commit -m "report-delivery: accept nobody_there for pickup requests"
```

---

### Task 6: `send-notification` texts the pickup contact

**Files:**
- Modify: `supabase/functions/_shared/sms.ts:104` (export `sendSms`)
- Modify: `supabase/functions/send-notification/index.ts`

- [ ] **Step 1: Export `sendSms`**

In `sms.ts` change `async function sendSms(` to `export async function sendSms(`. Nothing else.

- [ ] **Step 2: Add the contact branch to `send-notification`**

Imports:
```ts
import { sendSmsToUser, sendSmsToCouriers, sendSms, type SmsEvent } from "../_shared/sms.ts";
import { pickupContactSms } from "../_shared/pickupContact.ts";
```

Widen the request select (line ~66) to include `kind, package_description`:
```ts
    .select(
      "order_number, pickup_address, dropoff_address, pickup_lat, pickup_lng, package_size, package_description, max_price_cents, accepted_price_cents, sender_id, courier_id, kind",
    )
```

Insert this block just before the final `return json({ ok: true, results }, 200);`:
```ts
  // ── PICKUP CONTACT SMS ────────────────────────────────────────────
  // Pickup-kind only. The contact never signed up, so there is no consent
  // row to check: the requester named them for this one job, and the copy
  // carries STOP. Two messages max: accepted (with the PIN) and arrived.
  if (request.kind === "pickup" && (deliveryEvent === "accepted" || deliveryEvent === "arrived")) {
    const { data: contact } = await supabase
      .from("delivery_pickup_contacts")
      .select("name, phone, sms_status")
      .eq("delivery_request_id", delivery_request_id)
      .maybeSingle();
    if (!contact) {
      console.error(`send-notification: pickup request ${delivery_request_id} has no contact row`);
      results.contactSms = { ok: false, error: "no contact" };
    } else {
      const bodyText = pickupContactSms(deliveryEvent, {
        orderNumber: request.order_number,
        courierName: courierInfo?.firstName ?? null,
        requesterName: senderInfo?.firstName ?? null,
        description: request.package_description,
        pin: pickupPin,
      });
      if (bodyText) {
        const sent = await sendSms(contact.phone, bodyText);
        results.contactSms = sent;
        // Only the accepted text carries the PIN, so only it decides whether
        // the requester has to relay the code themselves.
        if (deliveryEvent === "accepted") {
          await supabase
            .from("delivery_pickup_contacts")
            .update({ sms_status: sent.ok ? "sent" : "failed" })
            .eq("delivery_request_id", delivery_request_id);
        }
      }
    }
  }
```

- [ ] **Step 3: Type-check and deploy**

Run: `cd ~/Spetza && npx deno@2 check supabase/functions/send-notification/index.ts && supabase functions deploy send-notification`
Expected: clean; deployed.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/sms.ts supabase/functions/send-notification/index.ts
git commit -m "send-notification: text the pickup contact the PIN on accept, and on arrival"
```

---

### Task 7: New Request — mode switch, contact fields, conditional photo

**Files:**
- Modify: `src/pages/sender/NewRequest.jsx`

- [ ] **Step 1: Imports and state**

Add imports:
```js
import { REQUEST_KINDS, pickupContactError } from '../../lib/requestKind.js'
import { normalizePhone } from '../../lib/phone.js'
```

Add state after `const [dropoffGeo, setDropoffGeo] = useState(blankGeo)`:
```js
  // Which way the delivery runs. Pickup mode: someone else hands the package
  // over and the requester waits at the dropoff.
  const [kind, setKind] = useState('send')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const isPickup = kind === 'pickup'
```

- [ ] **Step 2: Validation in `handleSubmit`**

Replace the photo check:
```js
    if (!isPickup && !photoPath) {
      toast.error('A photo of the package is required.')
      return
    }
    if (isPickup) {
      const contactErr = pickupContactError({ name: contactName, phone: contactPhone })
      if (contactErr) {
        toast.error(contactErr)
        return
      }
    }
```

- [ ] **Step 3: Two-step insert with rollback**

Replace the insert block (from `const { data: inserted, error } = await supabase` through `if (error) { toast.error(error.message); return }`):
```js
    const { data: inserted, error } = await supabase
      .from('delivery_requests')
      .insert({
        sender_id: user.id,
        kind,
        pickup_address: pickupAddress,
        pickup_lat: pickupGeo.lat,
        pickup_lng: pickupGeo.lng,
        dropoff_address: dropoffAddress,
        dropoff_lat: dropoffGeo.lat,
        dropoff_lng: dropoffGeo.lng,
        package_description: description,
        distance_miles: Number(distance.toFixed(2)),
        package_size: size.trim() || null,
        package_photo_path: isPickup ? null : photoPath,
        max_price_cents: priceCents,
        // The requester is the one waiting at the dropoff in pickup mode;
        // "bring it back" would mean back to the contact, which is a
        // different flow. Fixed to leave_at_door there.
        no_answer_policy: isPickup ? 'leave_at_door' : noAnswerPolicy,
      })
      .select('id')
      .single()
    if (error) {
      setSubmitting(false)
      toast.error(error.message)
      return
    }
    if (isPickup) {
      const { error: contactErr } = await supabase
        .from('delivery_pickup_contacts')
        .insert({
          delivery_request_id: inserted.id,
          name: contactName.trim(),
          phone: normalizePhone(contactPhone),
        })
      if (contactErr) {
        // A pickup job with nobody to collect from must not sit in the
        // courier pool. Remove it and let the requester try again.
        await supabase.from('delivery_requests').delete().eq('id', inserted.id)
        setSubmitting(false)
        toast.error(contactErr.message)
        return
      }
    }
    setSubmitting(false)
```

- [ ] **Step 4: `canSubmit`**

```js
  const canSubmit =
    !submitting &&
    pickupGeo.status === 'ok' &&
    dropoffGeo.status === 'ok' &&
    distance != null &&
    !overMax &&
    priceCents != null &&
    (!isPickup || !pickupContactError({ name: contactName, phone: contactPhone })) &&
    descriptionHonest &&
    liabilityAccepted &&
    hasPaymentMethod
```

- [ ] **Step 5: Render — switch, contact fields, labels**

Replace `<h1 className="font-display text-3xl text-ink mt-6">New delivery request</h1>` with:
```jsx
      <h1 className="font-display text-3xl text-ink mt-6">New delivery request</h1>
      <div className="mt-4 grid grid-cols-2 gap-2 p-1 rounded-lg bg-mist" role="tablist">
        {REQUEST_KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="tab"
            aria-selected={kind === k.value}
            onClick={() => setKind(k.value)}
            className={`py-2 rounded-md text-sm font-semibold transition-colors ${
              kind === k.value ? 'bg-white text-teal shadow-sm' : 'text-slate hover:text-ink'
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>
```

Change the two address field labels:
```jsx
        <Field label={isPickup ? 'Pick up from — address' : 'Pickup address'}>
```
```jsx
        <Field label={isPickup ? 'Deliver to me at' : 'Dropoff address'}>
```

Insert the contact fields immediately **before** the pickup address `<Field>`:
```jsx
        {isPickup && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Pick up from — name">
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Joe, or Joe's Pizza"
                maxLength={80}
                className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-teal focus:outline-none"
              />
            </Field>
            <Field label="Their mobile">
              <input
                type="tel"
                inputMode="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="(312) 555-0100"
                className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-teal focus:outline-none"
              />
              <div className="text-xs text-slate mt-1.5">
                We text them your courier's name and the pickup code when a courier accepts.
              </div>
            </Field>
          </div>
        )}
```

Wrap the photo field:
```jsx
        {!isPickup && (
          <Field label="Photo of the package">
            <PackagePhotoInput path={photoPath} onChange={setPhotoPath} />
          </Field>
        )}
```

Wrap the whole "If nobody's there" card in `{!isPickup && ( … )}`.

Change the honesty checkbox text:
```jsx
            <span className="text-xs text-slate leading-relaxed">
              {isPickup
                ? 'I confirm my description matches what the courier will collect.'
                : 'I confirm my description and photo match what the courier will collect.'}
            </span>
```

Change the submit button label:
```jsx
          {submitting ? 'Posting…' : isPickup ? 'Get it picked up' : 'Send it'}
```

- [ ] **Step 6: Build and run existing tests**

Run: `cd ~/Spetza && npm test && npm run build`
Expected: all vitest suites pass; build completes without errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/sender/NewRequest.jsx
git commit -m "New request: Send / Pick up switch with a named pickup contact"
```

---

### Task 8: Edit Request — same fields while open

**Files:**
- Modify: `src/pages/sender/EditRequest.jsx`

- [ ] **Step 1: Load the contact**

Imports:
```js
import { pickupContactError } from '../../lib/requestKind.js'
import { normalizePhone } from '../../lib/phone.js'
```

State (next to `photoPath`):
```js
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const isPickup = request?.kind === 'pickup'
```

Inside the load `.then(({ data }) => { … if (data) { … } })`, after `setPhotoPath(...)`:
```js
          if (data.kind === 'pickup') {
            supabase
              .from('delivery_pickup_contacts')
              .select('name, phone')
              .eq('delivery_request_id', id)
              .maybeSingle()
              .then(({ data: c }) => {
                if (cancelled || !c) return
                setContactName(c.name)
                setContactPhone(c.phone)
              })
          }
```

- [ ] **Step 2: Validation and save**

Replace the photo check:
```js
    if (!isPickup && !photoPath) {
      toast.error('A photo of the package is required.')
      return
    }
    if (isPickup) {
      const contactErr = pickupContactError({ name: contactName, phone: contactPhone })
      if (contactErr) {
        toast.error(contactErr)
        return
      }
    }
```

In the update payload change `package_photo_path: photoPath,` to `package_photo_path: isPickup ? null : photoPath,`.

After the request update succeeds (after `if (error) { … return }`), before `toast.success('Request updated.')`:
```js
    if (isPickup) {
      const { error: contactErr } = await supabase
        .from('delivery_pickup_contacts')
        .update({ name: contactName.trim(), phone: normalizePhone(contactPhone) })
        .eq('delivery_request_id', id)
      if (contactErr) {
        toast.error(contactErr.message)
        return
      }
    }
```

- [ ] **Step 3: Render**

Before the pickup address field:
```jsx
        {isPickup && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Pick up from — name">
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                maxLength={80}
                disabled={locked}
                className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-teal focus:outline-none disabled:opacity-60"
              />
            </Field>
            <Field label="Their mobile">
              <input
                type="tel"
                inputMode="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                disabled={locked}
                className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-teal focus:outline-none disabled:opacity-60"
              />
            </Field>
          </div>
        )}
```

Wrap the photo field in `{!isPickup && ( … )}`. (`Field` and `locked` already exist in this file — check the names match before editing; if the file's field wrapper is called something else, use that.)

- [ ] **Step 4: Build**

Run: `cd ~/Spetza && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/pages/sender/EditRequest.jsx
git commit -m "Edit request: pickup contact editable while open"
```

---

### Task 9: Request detail — contact, PIN status, pickup photo

**Files:**
- Modify: `src/pages/sender/RequestDetail.jsx`

- [ ] **Step 1: Load the contact**

Import:
```js
import { contactStatusCopy } from '../../lib/requestKind.js'
```

State: `const [contact, setContact] = useState(null)`

In `load()`, after `setRequest(req ?? null)`:
```js
    if (req?.kind === 'pickup') {
      const { data: c } = await supabase
        .from('delivery_pickup_contacts')
        .select('name, phone, sms_status')
        .eq('delivery_request_id', req.id)
        .maybeSingle()
      setContact(c ?? null)
    } else {
      setContact(null)
    }
```

Also subscribe to contact changes so `sms_status` flips live. Add a second `useRealtimeRefresh` after the existing one:
```js
  useRealtimeRefresh({
    channelName: id && request?.kind === 'pickup' ? `sender-contact:${id}` : null,
    table: 'delivery_pickup_contacts',
    filter: id ? `delivery_request_id=eq.${id}` : null,
    refresh: load,
  })
```

- [ ] **Step 2: Render the contact under the route**

Inside the Route card, after the `To` line:
```jsx
            {contact && (
              <div className="text-slate pt-1">
                <span className="text-slate/70 mr-2">Picking up from</span>
                <span className="text-ink">{contact.name}</span>
                <span className="text-slate/70 ml-2">{contact.phone}</span>
              </div>
            )}
```

Relabel `From`/`To` when `request.kind === 'pickup'`: `From` stays, `To` becomes `To me at`.

- [ ] **Step 3: Pickup code block**

Replace the `{request.status === 'accepted' && pickupPin && ( … )}` block with:
```jsx
        {request.status === 'accepted' && pickupPin && request.kind === 'pickup' && contact && (
          <div className="p-4 rounded-xl border border-teal/30 bg-teal/5">
            <div className="text-xs uppercase tracking-widest text-teal font-bold">Pickup code</div>
            <p className="text-sm text-slate mt-2">{contactStatusCopy(contact.name, contact.sms_status)}</p>
            {contact.sms_status === 'failed' && (
              <div className="mt-2 text-4xl font-bold tracking-[0.3em] text-ink text-center py-2">
                {pickupPin}
              </div>
            )}
            {request.courier_arrived_at && (
              <p className="text-sm text-green font-medium mt-2">Your courier is at {contact.name}'s now.</p>
            )}
          </div>
        )}
        {request.status === 'accepted' && pickupPin && request.kind !== 'pickup' && (
          <div className={`p-4 rounded-xl border ${
            request.courier_arrived_at
              ? 'border-green bg-green/5 ring-2 ring-green/30'
              : 'border-teal/30 bg-teal/5'
          }`}>
            {/* existing send-mode block body, unchanged */}
```
(keep the existing body of the send-mode block exactly as it is; only the condition changes.)

- [ ] **Step 4: Pickup photo**

After the Package card, before the `delivery_photo_path` block:
```jsx
        {request.pickup_photo_path && (
          <div className="p-4 rounded-xl border border-teal/30 bg-teal/5">
            <div className="text-xs uppercase tracking-widest text-teal font-bold">Picked up</div>
            <DeliveryProofPhoto path={request.pickup_photo_path} label="What your courier collected" />
          </div>
        )}
```

In the Package card, hide the thumbnail when there is no photo: `{request.package_photo_path && <PackagePhoto … />}`.

- [ ] **Step 5: Build**

Run: `cd ~/Spetza && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/pages/sender/RequestDetail.jsx
git commit -m "Request detail: pickup contact, text status, item photo"
```

---

### Task 10: Extract the proof-photo upload

**Files:**
- Create: `src/lib/proofUpload.js`
- Modify: `src/pages/courier/CourierDelivery.jsx:156-197`

- [ ] **Step 1: Create the helper**

```js
// Upload one photo to the private delivery-proof bucket under
// `<delivery_request_id>/<uuid>.<ext>` -- storage RLS and the edge functions
// both key off that first path segment. Used for the drop-off proof and,
// on pickup-kind requests, the item photo at collection.
import { supabase } from './supabase.js'
import { resizeImage } from './resizeImage.js'
import { uniqueId, isImageFile, imageExt } from './uploadName.js'

export const PROOF_BUCKET = 'delivery-proof'
export const MAX_PROOF_BYTES = 15 * 1024 * 1024

// Resolves the object path. Throws an Error with a message fit for a toast.
export async function uploadProofPhoto(deliveryRequestId, file) {
  if (!isImageFile(file)) throw new Error('Pick an image file.')
  if (file.size > MAX_PROOF_BYTES) throw new Error('Image must be under 15 MB.')
  let uploadFile = file
  try {
    uploadFile = await resizeImage(file)
  } catch {
    // Resize failed — upload the original rather than block a courier
    // who is standing on a doorstep.
  }
  const objectPath = `${deliveryRequestId}/${uniqueId()}.${imageExt(uploadFile)}`
  const { error } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(objectPath, uploadFile, { contentType: uploadFile.type || 'image/jpeg' })
  if (error) {
    console.error('proof upload failed', error)
    throw new Error("Couldn't upload that photo. Check your signal and try again.")
  }
  return objectPath
}
```

- [ ] **Step 2: Use it in CourierDelivery**

Replace the `PROOF_BUCKET`, `MAX_PROOF_BYTES` constants and the whole `onProofPhoto` function with:
```js
  const onProofPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingProof(true)
    try {
      setProofPath(await uploadProofPhoto(request.id, file))
    } catch (err) {
      // Anything unexpected (an old WebView, a decode failure) must surface,
      // not leave the button stuck on "Uploading…".
      console.error('proof photo failed', err)
      toast.error(err?.message || "Couldn't attach that photo.")
    } finally {
      setUploadingProof(false)
      // Allow re-picking the same file after a failure.
      e.target.value = ''
    }
  }
```

Replace the imports of `resizeImage` and `uploadName` with:
```js
import { uploadProofPhoto } from '../../lib/proofUpload.js'
```

- [ ] **Step 3: Build and test**

Run: `cd ~/Spetza && npm test && npm run build`
Expected: pass, clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/proofUpload.js src/pages/courier/CourierDelivery.jsx
git commit -m "Extract proof-photo upload so pickup can reuse it"
```

---

### Task 11: Courier delivery page — Pickup tag, contact, photo step, report reason

**Files:**
- Modify: `src/pages/courier/CourierDelivery.jsx`

- [ ] **Step 1: Load the contact**

State: `const [contact, setContact] = useState(null)` and `const [uploadingPickup, setUploadingPickup] = useState(false)`.

In `load()`, inside `if (req) { … }` after `setSender(prof ?? null)`:
```js
      if (req.kind === 'pickup') {
        const { data: c } = await supabase
          .from('delivery_pickup_contacts')
          .select('name, phone')
          .eq('delivery_request_id', id)
          .maybeSingle()
        setContact(c ?? null)
      } else {
        setContact(null)
      }
```

- [ ] **Step 2: Pickup photo handler**

After `onProofPhoto`:
```js
  // Pickup-kind: the requester never saw the item. This photo is their only
  // look at what was collected, and verify-pickup-pin refuses the PIN
  // until it exists.
  const onPickupPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPickup(true)
    try {
      const path = await uploadProofPhoto(request.id, file)
      const { error } = await supabase
        .from('delivery_requests')
        .update({ pickup_photo_path: path })
        .eq('id', request.id)
        .eq('courier_id', user.id)
      if (error) throw new Error(error.message)
      load()
    } catch (err) {
      console.error('pickup photo failed', err)
      toast.error(err?.message || "Couldn't attach that photo.")
    } finally {
      setUploadingPickup(false)
      e.target.value = ''
    }
  }
```

- [ ] **Step 3: PIN error copy and report reasons**

In `handlePickedUp`, replace `setPinError('Incorrect code — ask the sender to check')` with:
```js
      setPinError(isPickup ? `Incorrect code — ask ${contact?.name || 'them'} to check` : 'Incorrect code — ask the sender to check')
```
and add `const isPickup = request?.kind === 'pickup'` just above `const load = async () => {`.

Replace `REPORT_REASONS`:
```js
  const REPORT_REASONS = [
    { value: 'too_heavy', label: 'Heavier than described' },
    { value: 'wrong_size', label: 'Bigger than the size given' },
    { value: 'prohibited_item', label: "Something we don't carry" },
    { value: 'not_as_described', label: 'Not what was described' },
    ...(isPickup ? [{ value: 'nobody_there', label: 'Nobody there / item not ready' }] : []),
  ]
```

- [ ] **Step 4: Render — tag and contact card**

Header: after the `<h1>`:
```jsx
          {isPickup && (
            <span className="inline-block mt-2 px-2 py-0.5 rounded-full bg-teal/10 text-teal text-[10px] font-bold uppercase tracking-wide">
              Pickup
            </span>
          )}
```

After the Package card:
```jsx
        {isPickup && contact && (
          <div className="p-4 rounded-xl border border-mist bg-white">
            <div className="text-xs uppercase tracking-widest text-slate">Pick up from</div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="text-sm text-ink font-medium">{contact.name}</div>
              <a href={`tel:${contact.phone}`} className="text-sm text-teal hover:underline">Call</a>
            </div>
            <p className="text-xs text-slate mt-2 leading-relaxed">
              {contact.name} has been told to check your screen for {request.order_number} and their name before handing over.
            </p>
          </div>
        )}
```

In the Package card, hide the thumbnail when empty: `{request.package_photo_path && <PackagePhoto … />}`.

Relabel the "Sender" card heading to `{isPickup ? 'Requester' : 'Sender'}`.

- [ ] **Step 5: Render — photo step before PIN (arrived state)**

Replace the "Pickup handshake" card's two `<p>` lines and the input row with:
```jsx
                <div className="text-xs uppercase tracking-widest text-teal font-bold mb-2">Pickup handshake</div>
                {isPickup ? (
                  <>
                    <p className="text-sm text-slate mb-3">
                      Show {contact?.name || 'them'} this screen, photograph the item, then ask for the 4-digit code.
                    </p>
                    <div className="mb-3 p-3 rounded-lg bg-white border border-mist">
                      <div className="text-xs uppercase tracking-widest text-slate mb-1">1 · Photo of the item</div>
                      {request.pickup_photo_path ? (
                        <DeliveryProofPhoto path={request.pickup_photo_path} label="What the requester will see" />
                      ) : (
                        <p className="text-xs text-slate/80">Required before the code will work.</p>
                      )}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <label className="block">
                          <input type="file" accept="image/*" capture="environment" onChange={onPickupPhoto} disabled={uploadingPickup || acting} className="hidden" />
                          <span className={`block w-full py-2.5 rounded-lg border text-center text-sm font-medium cursor-pointer transition-colors ${
                            request.pickup_photo_path ? 'border-green/40 text-green hover:bg-green/5' : 'border-ink/20 text-ink hover:bg-mist'
                          }`}>
                            {uploadingPickup ? 'Uploading…' : request.pickup_photo_path ? '📷 Retake' : '📷 Take photo'}
                          </span>
                        </label>
                        <label className="block">
                          <input type="file" accept="image/*" onChange={onPickupPhoto} disabled={uploadingPickup || acting} className="hidden" />
                          <span className="block w-full py-2.5 rounded-lg border border-ink/20 text-center text-sm font-medium text-ink cursor-pointer hover:bg-mist transition-colors">
                            🖼 From library
                          </span>
                        </label>
                      </div>
                    </div>
                    <div className="text-xs uppercase tracking-widest text-slate mb-1">2 · Their code</div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate mb-1">The sender has been notified you're here.</p>
                    <p className="text-sm text-slate mb-3">Ask them for the 4-digit code to confirm pickup.</p>
                  </>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setPinError('') }}
                    placeholder="0000"
                    disabled={isPickup && !request.pickup_photo_path}
                    className="w-24 px-3 py-2 rounded-lg bg-white border border-mist text-center text-lg font-bold tracking-[0.3em] focus:border-teal focus:outline-none disabled:opacity-50"
                  />
                  <button
                    onClick={handlePickedUp}
                    disabled={acting || pin.trim().length < 4 || (isPickup && !request.pickup_photo_path)}
                    className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal/90 disabled:opacity-50 transition-colors"
                  >
                    {acting ? 'Verifying…' : 'Confirm pickup'}
                  </button>
                </div>
```

Also in the "Head to pickup" card (before arrival), change the "I've arrived" button label: `{acting ? 'Notifying…' : "I've arrived"}` and the paragraph to:
```jsx
                <p className="text-sm text-slate mb-2">
                  {isPickup
                    ? `Go to ${contact?.name || 'the pickup'} at the address below. Tap "I've arrived" when you're there — they get a text.`
                    : 'Go to the pickup address below. Tap "I\'ve arrived" when you\'re there.'}
                </p>
```

Change the report link text: `{isPickup ? "Can't collect this package" : "This package isn't as described"}`.

- [ ] **Step 6: Build and test**

Run: `cd ~/Spetza && npm test && npm run build`
Expected: pass, clean.

- [ ] **Step 7: Commit**

```bash
git add src/pages/courier/CourierDelivery.jsx
git commit -m "Courier delivery: pickup contact, item photo before PIN, nobody-there report"
```

---

### Task 12: Courier home — Pickup tag on cards

**Files:**
- Modify: `src/pages/courier/CourierHome.jsx:368-378` (active cards) and `:541-555` (open cards)

- [ ] **Step 1: Add the tag next to the order number in both card lists**

Active cards — after `{r.order_number}` `</div>`:
```jsx
                        {r.kind === 'pickup' && (
                          <span className="px-1.5 py-0.5 rounded-full bg-teal/10 text-teal text-[10px] font-bold uppercase tracking-wide">
                            Pickup
                          </span>
                        )}
```
Wrap the order number and the tag in `<div className="flex items-center gap-2">…</div>` so they sit on one line (the open-card list already has that wrapper; put the tag inside it after the New/Open pill).

- [ ] **Step 2: Build**

Run: `cd ~/Spetza && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/pages/courier/CourierHome.jsx
git commit -m "Courier home: tag pickup jobs"
```

---

### Task 13: Compliance copy

**Files:**
- Modify: `docs/a2p-10dlc-campaign-copy.md`
- Modify: `src/pages/Terms.jsx`

- [ ] **Step 1: A2P doc**

Append under the message-samples section:
```md
### Pickup contact (named by a requester, not a Spetza account)

A requester may name the person or business handing a package over. That
number receives at most two transactional texts for that one job:

- Accepted: "Spetza: Maria is picking up "Blue jacket" for Suresh. Before handing it over, ask to see the job on their phone — it shows SPZ-00021 and your name. Then give them PIN 4821. Reply STOP to opt out."
- Arrived: "Spetza: Maria is outside for the pickup."

STOP is honoured by Twilio's Messaging Service opt-out handling.
```

- [ ] **Step 2: Terms**

Find the section on notifications / SMS in `src/pages/Terms.jsx` (search `STOP`). Add one paragraph after it:
```jsx
          <p>
            If you post a pickup request, you confirm you have permission to give us the
            name and mobile number of the person handing the package over. We text that
            number at most twice about that delivery: once with your courier's name and the
            pickup code, and once when the courier arrives. They can reply STOP at any time.
          </p>
```

- [ ] **Step 3: Build and commit**

Run: `cd ~/Spetza && npm run build`

```bash
git add docs/a2p-10dlc-campaign-copy.md src/pages/Terms.jsx
git commit -m "Terms + A2P copy: texting a named pickup contact"
```

---

### Task 14: End-to-end on the test phones

**Files:** none — verification.

- [ ] **Step 1: Push and let Netlify deploy**

Run: `cd ~/Spetza && git push`
Expected: Netlify builds (~75 s). Open spetza.com and tap "Tap to Update" if shown.

- [ ] **Step 2: Post a pickup job (sender phone)**

New request → **Pick up something** → name = Suresh's own name, mobile = a phone Suresh holds that is *not* the sender or courier account → pickup address = anywhere in Chicago → deliver-to = another address → description "Test pickup" → size → post.
Expected: request appears in the sender list; `select kind from delivery_requests order by created_at desc limit 1` = `pickup`; a row exists in `delivery_pickup_contacts` with `sms_status = pending`.

- [ ] **Step 3: Accept (courier 1 phone)**

Expected within a minute: the contact phone receives the accepted text containing the real PIN and SPZ number. Requester page shows "We texted Suresh the pickup PIN and your courier's name." `sms_status = sent`.

- [ ] **Step 4: Arrive, photograph, PIN**

Courier taps "I've arrived" → contact phone receives "…is outside for the pickup." PIN field is disabled until a photo is attached. Attach photo → requester page shows it under "Picked up". Enter PIN → status In transit.

- [ ] **Step 5: Deliver as usual**

Proof photo, Mark delivered. Expected: charged, payout as on any send job.

- [ ] **Step 6: Failure path**

Post a second pickup job with a landline number (e.g. the 12 Sigma support line). Accept. Expected: `sms_status = failed`; requester page shows the PIN with "The text to … didn't go through. Give … this PIN yourself."

- [ ] **Step 7: Photo rule from the server**

With a fresh pickup job accepted and arrived, call verify-pickup-pin without a photo (from the browser console on the courier page):
```js
(await supabase.functions.invoke('verify-pickup-pin', { body: { delivery_request_id: '<id>', pin: '0000' } }))
```
Expected: error with `code: "photo_required"`, status 409 — before any PIN comparison.

- [ ] **Step 8: Record**

Add to `~/12Sigma/TASKS.md` under "Done": `Pickup requests shipped <date>; verified on SPZ-000xx (contact text, photo-before-PIN, landline fallback).` Tick the checklist artifact item if one is added for it.

---

### Task 15: Price breakout for both sides (added 2026-09-20 after Suresh's request)

**Why:** Today the sender sees one number (price + 15%) and the courier sees one number (price − fee). Both should see how it's made up, everywhere the amount appears.

**Shape, both sides:** big headline number, then two small lines under it:
- Courier: **$17.00** / `$20.00 Delivery` / `−$3.00 Platform fee` (+ `+$1.00 Earn-back credit` when the recorded fee is below the standard 15%)
- Sender: **$23.00** / `$20.00 Delivery` / `$3.00 Platform fee` (+ `$x Tip` when a tip exists)

**Files:**
- Modify: `src/lib/pricing.js` — add `breakoutForRequest(r, role)`; Test: `src/lib/pricing.test.js`
- Create: `src/components/PriceBreakout.jsx`
- Modify: `src/pages/sender/SenderHome.jsx:296-301`, `src/pages/sender/NewRequest.jsx:350-356`, `src/pages/sender/EditRequest.jsx:366-372`, `src/pages/sender/RequestDetail.jsx:384-394`, `src/pages/courier/CourierHome.jsx:385-388, 473-476, 571-574`, `src/pages/courier/CourierDelivery.jsx:528-534`

- [ ] **Step 1: Failing tests** (append to `pricing.test.js`)

```js
import { breakoutForRequest } from './pricing.js'

describe('breakoutForRequest', () => {
  it('sender: total on top, delivery + platform fee below', () => {
    expect(breakoutForRequest({ max_price_cents: 2000 }, 'sender')).toEqual({
      headline: 2300,
      lines: [
        { label: 'Delivery', cents: 2000 },
        { label: 'Platform fee', cents: 300 },
      ],
    })
  })
  it('sender: uses the recorded fee and adds a tip line', () => {
    expect(breakoutForRequest({ accepted_price_cents: 2000, max_price_cents: 2000, platform_fee_cents: 300, tip_cents: 500 }, 'sender')).toEqual({
      headline: 2800,
      lines: [
        { label: 'Delivery', cents: 2000 },
        { label: 'Platform fee', cents: 300 },
        { label: 'Tip', cents: 500 },
      ],
    })
  })
  it('courier: take on top, delivery and fee below, fee negative', () => {
    expect(breakoutForRequest({ max_price_cents: 2000 }, 'courier')).toEqual({
      headline: 1700,
      lines: [
        { label: 'Delivery', cents: 2000 },
        { label: 'Platform fee', cents: -300 },
      ],
    })
  })
  it('courier: shows the earn-back credit when the recorded fee is below 15%', () => {
    expect(breakoutForRequest({ accepted_price_cents: 2000, max_price_cents: 2000, platform_fee_cents: 200, tip_cents: 500 }, 'courier')).toEqual({
      headline: 2300,
      lines: [
        { label: 'Delivery', cents: 2000 },
        { label: 'Platform fee', cents: -300 },
        { label: 'Earn-back credit', cents: 100 },
        { label: 'Tip', cents: 500 },
      ],
    })
  })
  it('returns null without a price', () => {
    expect(breakoutForRequest({}, 'sender')).toBeNull()
  })
})
```

- [ ] **Step 2: Implement in `pricing.js`**

```js
// Everything a page needs to show one amount honestly: the headline the
// person cares about, and the lines that add up to it. `role` picks the
// side: the sender pays price + fee, the courier keeps price − fee.
export function breakoutForRequest(r, role) {
  const price = r?.accepted_price_cents ?? r?.max_price_cents
  if (price == null) return null
  const standardFee = feeFor(price)
  const fee = r?.platform_fee_cents ?? standardFee
  const tip = r?.tip_cents || 0
  const lines = [{ label: 'Delivery', cents: price }]
  if (role === 'sender') {
    lines.push({ label: 'Platform fee', cents: fee })
    if (tip) lines.push({ label: 'Tip', cents: tip })
    return { headline: price + fee + tip, lines }
  }
  lines.push({ label: 'Platform fee', cents: -standardFee })
  // The fee on record shrinks by the earn-back credit at delivery; show the
  // credit as its own line so the courier sees why they keep more.
  if (fee < standardFee) lines.push({ label: 'Earn-back credit', cents: standardFee - fee })
  if (tip) lines.push({ label: 'Tip', cents: tip })
  return { headline: price - fee + tip, lines }
}
```

- [ ] **Step 3: `PriceBreakout.jsx`**

```jsx
// Headline amount with the lines that make it up underneath. Used on every
// card and page that shows money, so both sides always see the same story.
const dollars = (cents) => `${cents < 0 ? '−' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`

export default function PriceBreakout({ breakout, caption, size = 'md', className = '' }) {
  if (!breakout) return null
  const headlineClass = size === 'lg' ? 'text-2xl' : 'text-xl'
  return (
    <div className={className}>
      <div className={`font-display ${headlineClass} text-ink`}>
        {dollars(breakout.headline)}
        {caption && <span className="ml-2 text-xs font-sans text-slate/70">{caption}</span>}
      </div>
      <div className="mt-1 space-y-0.5">
        {breakout.lines.map((l) => (
          <div key={l.label} className="flex items-baseline gap-2 text-xs text-slate">
            <span className="text-ink tabular-nums w-16">{dollars(l.cents)}</span>
            <span>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire every amount**

Replace each single-number block with `<PriceBreakout breakout={breakoutForRequest(r, 'sender'|'courier')} caption="…" size="lg"|"md" />`, keeping the existing caption words ("incl. service fee" → drop it; "you earn"; "earned" / "earned incl. tip"; NewRequest/Edit "Total"; RequestDetail replaces the Delivery/Tip/Total rows; CourierDelivery replaces the "You receive" row). NewRequest/EditRequest have no request row yet — build one: `breakoutForRequest({ max_price_cents: priceCents }, 'sender')`. Leave the courier earnings tiles (today/week/total), the Accept button label and the confirm dialogs as they are — they're totals, not a single delivery.

- [ ] **Step 5: `npm test && npm run build`** — green. Commit: `Show the price breakout to senders and couriers everywhere an amount appears`.
