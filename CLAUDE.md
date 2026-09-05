# Spetza

Peer-to-peer small-package delivery marketplace. Sender posts pickup → dropoff with a price; courier accepts and delivers. Routing-based (the distinguishing feature vs. time-slot marketplaces like Kiddaboo).

## Stack

- Vite + React 18, JSX (not TypeScript)
- Tailwind CSS 3, mobile-first
- React Router v6
- Supabase (auth + Postgres + RLS + edge functions in Deno/TypeScript)
- Sonner for toasts
- Capacitor for the native iOS and Android shells
- Stripe Connect (payments + courier payouts), Twilio (SMS + Verify), Checkr
  (background checks), Resend (transactional email), Firebase Cloud Messaging (push)

## Roles

- `sender` — posts delivery requests
- `courier` — claims and fulfills them

Set in `profiles.account_type` at onboarding via `ChooseRole`. `RequireRole` enforces role-gated routes.

## Conventions

- Frontend lives at repo root (no `frontend/` subdir)
- Supabase migrations are versioned: `supabase/migrations/<timestamp>_<name>.sql`
- Money is stored as integer cents (`max_price_cents`)
- Never push to remote without explicit ask
- Never call `supabase db push` without explicit ask
- Edge functions run on Deno, where the Stripe library resolves to its web
  build and the only crypto provider is SubtleCrypto. Anything needing HMAC
  must use the **async** API — `constructEventAsync`, never `constructEvent`,
  which throws on every call and surfaces as an indistinguishable 401. Webhook
  signature checks go through `_shared/stripeWebhook.ts`

## Wired

- Auth: password + magic-link fallback + Twilio Verify phone OTP at signup (`RequireAuth` blocks unverified users at `/verify-phone`)
- Sender: distance-based pricing (geocoded addresses, priced per mile), required package photo, edit/cancel for open requests, human-readable order numbers (SPZ-00001), saved payment method via SetupIntent
- Courier: Connect Express onboarding, service area (home + radius), open-requests list filtered by radius via haversine
- Payment loop: accept authorizes a manual-capture PI via Stripe Connect with `on_behalf_of` + application fee; mark-delivered captures it (`complete-delivery` edge fn); sender-cancel and courier-abandon both release the hold (`cancel-delivery` edge fn) — only from `accepted`, not after pickup
- Verification: `/courier/verify` uploads selfie + ID front + ID back to private `courier-verification` bucket; sets status=pending; accept-delivery is gated on `verification_status=approved`. Admin queue at `/admin` (gated on `profiles.is_admin`) approves/rejects via `review-verification` edge fn
- Route map: `RouteMap` component (Leaflet + OSM tiles, no API key) shown on new-request preview and on courier active-delivery cards
- Ratings: mutual 5-star + optional comment after delivery. Trigger enforces rater/ratee were on the delivery and it's delivered; aggregate denormalized to `profiles.rating_avg` + `rating_count`. Prompts inline on delivered cards; badges in role headers
- Counterparty display: `public_profiles` view (id, first_name, rating_avg, rating_count) — used to show courier chip on sender's assigned requests
- Sender request detail: `/sender/requests/:id` — status pill, route map, courier chip, lifecycle timeline with timestamps, payment breakdown, inline cancel and rating
- Courier delivery detail: `/courier/deliveries/:id` — mirror view with sender chip, "Your take" breakdown (delivery - platform fee), inline pickup/deliver/abandon and rating
- Realtime: `useRealtimeRefresh` hook subscribes to postgres_changes on delivery_requests and refetches. Wired on SenderHome, RequestDetail, CourierHome (open pool + own deliveries), CourierDelivery
- Storage: `package-photos` public bucket with sender-scoped RLS; `courier-verification` private bucket with owner + admin read
- Address entry: Google Places autocomplete behind the `places-autocomplete`
  edge function, so the API key never reaches the client. `circle.radius` for
  the location bias has a hard 50,000m ceiling — larger values 400 the whole
  request. Per-user spend budgets via `_shared/rateLimit.ts`; `geocode-address`
  is the same shape of cost and is **not** yet budgeted
- Notifications: push via FCM (`_shared/fcm.ts`, `push_tokens`, nearby-courier
  fan-out), SMS via Twilio on every delivery event (`_shared/sms.ts`, opt-in and
  revocable), transactional email via Resend (`_shared/email.ts`), operator
  alerts to contact@12sigma.com (`_shared/operatorAlert.ts`)
- Background checks: Checkr, `$40` paid by the courier and earned back at `$1`
  per delivery over 40 deliveries via a reduced `application_fee`. Webhook at
  `checkr-webhook`; adjudication in `adjudicate-background-check`
- Pickup handoff: sender-held PIN the courier enters at pickup
  (`verify-pickup-pin`), with brute-force lockout
- Tips: post-delivery, `application_fee_amount: 0` — Spetza takes nothing
- Disputes: `payment_disputes` table fed by `stripe-payment-webhook`, surfaced
  on the admin Payments page. This is the *card-network* dispute path
- Admin: full module at `/admin` gated on `profiles.is_admin` — dashboard,
  users, deliveries, payments, verifications, ratings, reports, demand map
- Native shells: Capacitor configured for iOS and Android, zoom locked

## Not yet wired

- **Neither app store submission has been made** — the shells build, nothing is
  published
- **No in-app dispute path for post-pickup issues.** `payment_disputes` covers
  chargebacks after the fact; there is no route for "the package arrived
  broken" short of a card dispute
- **No masked calling.** Sender and courier cannot contact each other during a
  delivery; that needs Twilio Proxy
