# Spetza

Get it there. Spetza is a peer-to-peer small-package delivery marketplace: senders post a pickup and dropoff with a price, nearby couriers accept and deliver. Routing-based, not time-slot based.

## Status

Scaffold. Two roles wired (sender, courier) with auth, role gating, request posting, and an open-requests feed. Accept/payments/maps not yet wired. Capacitor not yet wired.

## Run

```
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Apply the database schema by running the SQL in `supabase/migrations/` against your Supabase project.

## Stack

- Vite + React 18 (JSX, not TypeScript)
- Tailwind CSS 3
- React Router v6
- Supabase (auth + Postgres + RLS)
- Sonner for toasts
- Vitest + @testing-library/react
