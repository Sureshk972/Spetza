# Spetza — launch-ready in 7 days

**Thu 3 Sep → Wed 9 Sep 2026**

## Goal

Every line of code done, tested and deployed. The cutover checklist written and
rehearsed, but **keys not flipped**. Suresh pulls the trigger later, in one
sitting, when Twilio approves and he's off the road.

Explicitly not this week: App Store / Play Store submission, and the separate
Spetza Stripe account. Both have review tails that can't be compressed and
neither blocks a Chicago launch.

## Two dates that shape the week

- **Mon 7 Sep is Labor Day.** Stripe, Checkr and Twilio support are dark. Nothing
  that depends on a vendor answering gets scheduled that day.
- **The NY trip may overlap 9/3–9/4.** If so, slide the whole plan forward two
  days — the order matters more than the dates.

## Standing background item

Twilio A2P went **In review on 25 Aug** and may take weeks. Nothing this week
depends on it. If it's rejected again, that jumps the queue: read the reviewer
note against `docs/a2p-10dlc-campaign-copy.md` before touching anything, and
confirm the status chip flips to "In review" before calling a resubmission done.

---

## Thu 3 Sep — ship what's already built

Address autocomplete is written, tested and committed, and has been sitting
unshipped since 25 Aug.

- [ ] **Suresh:** enable **Places API (New)** in the Google Cloud project behind
      `GOOGLE_MAPS_API_KEY`; add it to the key's allowlist if restricted. ~5 min.
- [ ] Verify autocomplete end to end against the dev server: suggestions appear,
      city/state/zip fill, no `geocode-address` call fires, map and price render.
- [ ] Add a per-user rate limit to the `places-autocomplete` edge function. It's
      auth-gated but unthrottled — any signed-in account can burn Places quota.
- [ ] Push to Netlify, verify live on spetza.com.
- [ ] **Suresh:** confirm Checkr **production** API access actually landed. It was
      requested 13 Aug for 14 Aug and has not been confirmed since. If it hasn't,
      chase it today — it's the one cutover item with an external dependency.

**Done when:** a sender can type three characters and pick their address on
spetza.com.

## Fri 4 Sep — close the money gaps

`stripe-connect-webhook` is the only Stripe handler that exists. Disputes and
failed payments currently land nowhere.

- [ ] New handler for `charge.dispute.created` and `payment_intent.payment_failed`.
- [ ] Decide and implement what each does: notify Suresh, mark the delivery, and
      never silently swallow the event.
- [ ] Exercise both with `stripe trigger` in test mode.
- [ ] Deploy and confirm the events arrive.

**Done when:** no payment failure can happen without someone finding out.

## Sat 5 Sep — support surface

- [ ] Resend inbound for **contact@spetza.com**, routed somewhere Suresh reads.
      The domain is already DKIM/SPF/MX verified.
- [ ] Send a real test mail in and confirm it arrives.
- [ ] Sync the opt-out wording in `docs/a2p-10dlc-campaign-copy.md` to match what
      is actually in the Twilio console.

**Done when:** the address printed in the HELP reply is a real inbox.

## Sun 6 Sep — welcome page

The first thing a real Chicago customer sees.

- [ ] Images, "How it works" flow, pricing preview.
- [ ] Refresh the testimonials.
- [ ] Check it on a phone, not just a desktop viewport.

**Done when:** the page sells the thing without needing a demo.

## Mon 7 Sep — Labor Day: no-vendor work only

- [ ] Code-split the bundle. It's 1.3 MB (369 KB gzipped) and Vite has been
      warning about it. First-load speed on mobile data is a conversion issue.
- [ ] General performance pass.

**Done when:** the build stops warning and first paint is quicker on 4G.

## Tue 8 Sep — write the cutover runbook

Turn launch from an improvisation into a checklist. **Write and rehearse; do not
fire.**

- [ ] One document, exact commands in order, with a verification step after each:
  - `COURIER_PAYS_BACKGROUND_CHECK=true` in Supabase secrets
  - SQL: `alter table profiles alter column background_check_status set default 'not_started';`
  - Stripe test keys → live keys
  - Checkr staging → production key and env
  - Register the Stripe live webhook + `STRIPE_CONNECT_WEBHOOK_SECRET`
  - Decide `VITE_TEST_MODE` (currently false for the Twilio screenshots)
- [ ] Write the SQL migration file — don't apply it.
- [ ] Note the rollback for every step. Some of these move real money.

**Done when:** launch day is reading a list, not remembering.

## Wed 9 Sep — full regression, then freeze

- [ ] Walk the entire sender flow on a fresh account: signup → phone → post a
      delivery → pay → track → rate.
- [ ] Walk the entire courier flow: signup → verification → accept → PIN pickup →
      arrived → delivered → payout → earn-back.
- [ ] Fix whatever that turns up.
- [ ] Tag a release.

**Done when:** both flows survive a cold walkthrough with no hand-holding.

---

## Where this leaves things on 9 Sep

Code complete, deployed, regression-tested. Launch is one rehearsed session
whenever Twilio clears and Suresh says go. SMS switches on by itself the moment
the campaign is approved — nothing else waits on it.
