# Courier splash page — spetza.com/drive

**Date:** 2026-09-28 · **Status:** approved by Suresh

## Purpose

The first thing a courier sees during the recruiting period, before senders
launch. It is the link in the Craigslist / Facebook / text recruiting ads
(`docs/marketing/courier-recruiting.md`). It sells the benefits and sends the
courier into the real signup. The main spetza.com / `/welcome` page is
unchanged.

## Route

- New public route `/drive` → `src/pages/Drive.jsx`. No auth.
- Reachable whether or not `VITE_COMING_SOON` is on.
- A signed-in visitor still sees the page (harmless); the buttons go to
  `/signup` regardless.

## Content (top to bottom, mobile-first, one column)

1. **Hero** — Spetza wordmark; headline "Get paid to drive the route you're
   already driving."; one-line subhead; primary **Become a courier** button.
2. **What you earn** — table of what the courier pockets per delivery,
   computed from `TIERS` + `courierTakeFor` in `src/lib/pricing.js` (never
   hard-coded): under 2 mi $8.50 · 2–5 $12.75 · 5–10 $17.00 · 10–20 $21.25 ·
   20–50 $29.75. Line under it: "Plus 100% of tips."
3. **Why Spetza** — four short points: no shifts, no boss (take the runs you
   want); bike, car, scooter or on foot; paid to your bank in about 2 business
   days via Stripe; packages only — no food, no waiting on kitchens.
4. **How to start** — three numbered steps: sign up (about 10 minutes);
   background check; start taking runs. Step 2 reads the
   `courier_pays_background_check` app setting (same `useAppSetting` hook as
   Welcome): on → "One-time $40 background check — earned back at $1 per
   delivery"; off → "Background check on us — no fee to start."
5. **Early-courier perk** — "Launching in Andersonville, Uptown and Edgewater
   first. Early couriers get first pick of the runs."
6. **Footer CTA** — second **Become a courier** button; links to
   "How we vet every courier" (`/trust`) and FAQ (`/faq`); Spetza DBA footer.

No testimonials.

## Button behavior

Both buttons: set `localStorage['spetza:intended_role'] = 'courier'` (the key
ChooseRole already reads to pre-select a role; wrapped in try/catch) and link
to `/signup`. The courier still taps once on ChooseRole to confirm — by design
(see comment in `SignUp.jsx`). Fire analytics `trackEvent('courier_splash_cta',
{ position: 'hero' | 'footer' })`, plus `courier_splash_viewed` on mount.

## Look

Spetza palette and Nunito display font (existing Tailwind tokens); money
figures in the green accent; courier-side "money-first cockpit" tone per
`project_spetza_ux_principle`. Cream/ink editorial restraint as on Welcome.

## Testing

- Vitest: the earnings table renders the five courier-take amounts from
  `pricing.js`; step 2 copy flips with the app setting; CTA sets the stash.
- Browser check at 375px: no horizontal scroll, both CTAs reach `/signup`.

## Out of scope

Waitlist/lead capture, sender content, per-neighborhood pages, A/B tests.
