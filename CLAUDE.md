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

## Not yet wired

Accept transaction, payments (Stripe), maps/routing, Capacitor native shell.
