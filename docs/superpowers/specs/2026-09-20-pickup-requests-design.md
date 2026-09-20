# Pickup requests — design

**Date:** 2026-09-20 · **Status:** approved in conversation, awaiting written review

## What

Today a requester posts a delivery from where they are to someone else
("send"). This adds the reverse: the requester asks a courier to collect
something from a named person or business and bring it to them ("pickup").

Same couriers, same pool, same pricing, same payment. What changes is who is
standing at the pickup door, and therefore how the handover is verified.

## Decisions made

| Question | Decision |
|---|---|
| Who hands over at pickup | Private people and businesses equally |
| Door check | One PIN, both directions: contact is told to see the job on the courier's phone (job number + their name), then gives the PIN |
| Pickup contact details | Name + mobile **required**; if the text fails, requester gets the PIN to relay |
| Package photo | Courier photographs the item at pickup; none at posting |
| Nobody at pickup / not ready | Same as today: courier reports, job cancelled, no charge |
| How requester chooses | One form, switch at top: **Send something / Pick up something** |
| Stronger checks (courier photo page, two codes, trip fee) | Deferred |

## 1. Data

`delivery_requests`
- `kind` enum `request_kind` (`send`, `pickup`), not null, default `send`.
- `pickup_photo_path` text, null. Storage: same bucket as delivery-proof photos, same path convention.

New table `delivery_pickup_contacts`
- `delivery_request_id` uuid PK → `delivery_requests(id)` on delete cascade
- `name` text not null
- `phone` text not null (E.164)
- `sms_status` enum (`pending`, `sent`, `failed`), default `pending`
- `created_at`
- RLS: select for `auth.uid() = sender_id` or `auth.uid() = courier_id` of the parent row; insert/update/delete by sender only while the parent is `open`. Same shape as `delivery_pins`. Service role writes `sms_status`.

Nothing else changes: status enum, pricing, payouts, admin pages, courier pool query all work on the columns they already use.

## 2. Requester (`NewRequest.jsx`, `EditRequest.jsx`, `RequestDetail.jsx`)

New Request
- Segmented switch at the top: **Send something** (default) / **Pick up something**. Flipping it clears nothing the user already typed.
- Pickup mode relabels and reorders:
  - "Pick up from": contact name, contact mobile, address (existing `StructuredAddressInput` + geocode).
  - "Deliver to": address. No saved home address exists on profiles, so it is typed.
  - Description + size as today. **Photo section hidden and not required.**
  - Price, payment-method gate, honesty + liability checkboxes unchanged.
  - No-answer policy is **fixed to `leave_at_door`** and the chooser is hidden. The requester is the one waiting at the dropoff; "return to sender" would mean returning to the contact, which needs a second PIN text and a return flow the contact never agreed to. Deferred with the other stronger checks.
- Insert writes `kind: 'pickup'`, then inserts the contact row. Two writes; if the second fails, delete the request and show the error (no orphan job in the pool).
- Edit: same fields editable while `open`.

Request detail
- Pickup mode shows "Picking up from Joe · (312) 555-0100" under the pickup address.
- Once accepted:
  - `sms_status = sent` → "We texted Joe the pickup PIN and your courier's name."
  - `sms_status = failed` → the PIN, large, with "The text to Joe didn't go through. Give Joe this PIN yourself."
  - `pending` (webhook not back yet) → "Texting Joe…"
- When `pickup_photo_path` is set, show the photo under "Picked up".

## 3. Pickup contact (never signs up)

Sent from `send-notification` via the existing `delivery_requests_notify` trigger, `kind = 'pickup'` only.

- On `accepted`:
  > Spetza: Maria is picking up "[description]" for Suresh, arriving about [ETA]. Before handing it over, ask to see the job on her phone — it shows SPZ-00021 and your name. Then give her PIN 4821. Reply STOP to opt out.
- On `mark-arrived` (function already exists, add the branch):
  > Spetza: Maria is outside for the pickup.
- Twilio rejection (landline, invalid, undeliverable): write `sms_status = failed`. Twilio's synchronous 4xx is enough for launch; carrier-level drops are the existing "record delivery outcomes" gap and not solved here.
- ETA: reuse whatever the sender's accepted text uses today; if there is none, omit the clause.

Compliance: add one line to `docs/a2p-10dlc-campaign-copy.md` and the Terms: a requester may name a pickup contact who receives up to two transactional texts about that job, with STOP honoured.

## 4. Courier (`CourierHome.jsx`, `CourierDelivery.jsx`)

- Job card: **Pickup** tag. Addresses and "you earn" unchanged. Contact name/phone not shown until accepted (RLS enforces this).
- Delivery page, accepted state: "Pick up from **Joe**" with a tel: link, and the reminder "Joe has been told to check your screen for SPZ-00021 and his name."
- Pickup step order in pickup mode: **1. Photograph the item** (reuses `DeliveryProofPhoto` uploader, writes `pickup_photo_path`) → **2. Enter PIN**. PIN field disabled until the photo is uploaded. `verify-pickup-pin` rejects with 409 if `kind = 'pickup'` and `pickup_photo_path` is null, so the rule holds server-side too.
- Report-problem reasons gain `nobody_there` — "Nobody there / item not ready". `report-delivery` treats it like the others: cancel, release payment, no charge.

## Out of scope

Trip fee for wasted pickups · return-to-contact when the requester is not home · public courier-photo page for the contact · two-code handshake · saved home address on profiles · recipient contact for send-mode (separate item on the launch list).

## Testing

- Deno tests: `verify-pickup-pin` photo-before-PIN rule; `send-notification` pickup-contact branch builds the right text and skips for `kind = 'send'`.
- Vitest: NewRequest pickup mode hides photo, requires name + mobile, inserts `kind: 'pickup'` + contact row, rolls back on contact insert failure.
- Manual on the test phones: post a pickup job, courier 1 accepts, contact phone receives the text with the real PIN, courier photo appears on the requester's page, PIN moves it to picked-up, deliver as today. Then once with a landline number to see the fallback.
