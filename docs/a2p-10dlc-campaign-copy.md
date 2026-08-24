# A2P 10DLC campaign copy — Spetza

Paste-ready text for campaign `CMcac8fdb01facd5ab5fa05af51dbca2fa`
(brand `BN2521b61894ee4999b399b326777765bb`, use case DELIVERY_NOTIFICATION).

Written after the 2026-08-24 rejection (errors 30896 + 30923). It describes
the opt-in flow shipped in commit `ba2abfb` — do not submit this text until
that build is live on spetza.com, and screenshot the live page, not a local
dev server.

---

## Message flow / opt-in description

> End users opt in on Spetza's phone verification page at
> https://spetza.com/verify-phone, reached after creating an account at
> https://spetza.com/signup. The page contains a mobile number input field
> and, directly beneath it, a separate checkbox — labeled "Optional" and
> unchecked by default — reading: "I agree to receive text messages from
> Spetza about my deliveries — when a courier accepts, arrives, picks up,
> and drops off — at the number above. Message frequency varies. Message
> and data rates may apply. Reply STOP to unsubscribe or HELP for help. See
> our Privacy Policy and Terms of Service."
>
> The checkbox is not required to submit the form, create an account, or use
> the service. Consent is not a condition of any purchase or service. Users
> who leave it unchecked receive email and in-app push notifications only and
> have full access to Spetza. Users may turn messaging on or off at any time
> from their Profile page under "Text messages", in addition to replying STOP.
>
> Privacy Policy: https://spetza.com/privacy
> Terms of Service: https://spetza.com/terms

## Screenshots (hosted, live)

- https://spetza.com/a2p/optin-verify-phone.jpg
- https://spetza.com/a2p/signup-terms.jpg

Note: `VITE_TEST_MODE` was set to `false` on 2026-08-24 and deliberately left
off, so the live site matches these images. Revisit after approval.

## Screenshots to attach

1. `https://spetza.com/verify-phone` — full page, checkbox visibly **unchecked**,
   with the "Send code" button visibly **enabled**. This is the single most
   important image: it proves the form submits without consent.
2. Profile page "Text messages" panel — proves standing self-serve opt-out.

## Opt-out / help

- **STOP** — "You've been unsubscribed from Spetza texts. No more messages will
  be sent to this number. Reply START to resubscribe."
- **HELP** — "Spetza delivery updates. Msg&data rates may apply. Msg frequency
  varies. Reply STOP to unsubscribe. Support: contact@spetza.com"

## Notes for next time

The one-time verification code is a separate, user-initiated message — tapping
"Send code" is its own opt-in — and sends regardless of the checkbox. Keep that
distinction intact if the flow is ever reworked; collapsing the two back
together is what produced error 30923.
