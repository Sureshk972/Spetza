# Spetza

Peer-to-peer small-package delivery marketplace. Sender posts pickup → dropoff with a price; courier accepts and delivers. Routing-based (the distinguishing feature vs. time-slot marketplaces like Kiddaboo).

## Stack

- Vite + React 18, JSX (not TypeScript)
- Tailwind CSS 3, mobile-first
- React Router v6
- Supabase (auth + Postgres + RLS)
- Sonner for toasts

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

## Wired

- Auth: password + magic-link fallback + Twilio Verify phone OTP at signup (`RequireAuth` blocks unverified users at `/verify-phone`)
- Sender: distance-based pricing (geocoded addresses, priced per mile), required package photo, edit/cancel for open requests, human-readable order numbers (SPZ-00001), saved payment method via SetupIntent
- Courier: Connect Express onboarding, service area (home + radius), open-requests list filtered by radius via haversine
- Payment loop: accept authorizes a manual-capture PI via Stripe Connect with `on_behalf_of` + application fee; mark-delivered captures it (`complete-delivery` edge fn); sender-cancel and courier-abandon both release the hold (`cancel-delivery` edge fn) — only from `accepted`, not after pickup
- Storage: `package-photos` public bucket with sender-scoped RLS

## Not yet wired

Map UI (pickup→dropoff visualization), courier verification queue + admin approval, Capacitor native shell, push notifications, transactional email.
