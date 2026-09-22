# Checkr cutover runbook

**Approved 2026-09-21.** Checkr authorized 12 Sigma LLC's production account for
API integration. Production URI `12-sigma-llc-7ef9db0ee6`, no Nodes, five
production contacts already set to rooblix2000@gmail.com.

**Do this in the same sitting as the Stripe live-key swap.** Live Stripe with
staging Checkr means couriers pay a real $40 for a fake background check.

**Roughly 45 minutes**, most of it waiting for one real report.

---

## Before the sitting (can be done any time)

### A. Fix the staging package so CONSIDER can be tested — optional but cheap

Every staging check has come back CLEAR because Checkr's mock candidates only
return CONSIDER when the package includes a **County Criminal Search**. Ours
doesn't.

1. Checkr **staging** dashboard → **Packages** → create or edit a package that
   includes a county criminal search (e.g. "Essential Criminal").
2. Set `CHECKR_PACKAGE_SLUG` to it in Supabase secrets *(staging only — revert
   or re-point before the cutover)*.
3. Run a check on a mock candidate from Checkr's
   [API Test Plan](https://docs.google.com/spreadsheets/d/1BhoWaGgGIk1o2NRWjPkLJrSgBZqKH4lrd1L8rmiX1Rg/edit?gid=1160685934)
   and watch `consider` land in Admin → Background Checks, then adjudicate both
   ways.

This exercises the consider / adverse-action paths, which have **never run**.
Skipping it means the first real `consider` courier is the test.

---

## The cutover

### 1. Production API key (Suresh, dashboard)

1. Sign in to **dashboard.checkr.com** (production, not staging).
2. **Developers → API keys** → create a **Secret** key. Copy it — it is shown once.
3. Keep the tab open; the same key signs webhooks (below).

### 2. Confirm the production package slug (Suresh, dashboard)

1. Production dashboard → **Packages**.
2. Note the **slug** of the package couriers should run. A staging slug does not
   necessarily exist in production — this is its own step, not an assumption.
3. If a county criminal search is wanted for real couriers, pick a package that
   includes one here too.

### 3. Live webhook URL (Suresh, dashboard)

1. Production dashboard → **Developers → Webhooks** → add:
   `https://ggjjoagjurlirdaenttp.supabase.co/functions/v1/checkr-webhook`
2. Subscribe to exactly the events `_shared/checkr.ts::statusForReport` handles
   (verified against the code, 22 Sep):
   `report.created`, `report.completed`, `report.suspended`, `report.resumed`,
   `report.disputed`, `report.canceled`, `report.engaged`,
   `report.pre_adverse_action`, `report.post_adverse_action`.
   Anything else is ignored with a 200 — harmless, but don't subscribe to noise.
3. No separate signing secret is issued. Checkr signs each request with
   **HMAC-SHA256 over the raw body, keyed with the production API key**
   (confirmed by Checkr 2026-09-22). `_shared/checkr.ts::verifySignature` already
   does exactly this — so the same `CHECKR_API_KEY` secret serves both calls and
   verification.

### 4. Swap the secrets (Claude, CLI)

```bash
cd ~/Spetza
supabase secrets set CHECKR_API_KEY='<production secret key>'
supabase secrets set CHECKR_ENV=production
supabase secrets set CHECKR_PACKAGE_SLUG='<production package slug>'
```

`CHECKR_NODE_ID` is **not** needed — the production account has no Nodes
(confirmed 17 Sep).

Redeploy the functions that read them:

```bash
supabase functions deploy start-background-check
supabase functions deploy checkr-webhook
supabase functions deploy adjudicate-background-check
```

### 5. Prove the webhook signature (Claude + Suresh)

`checkr-webhook/index.ts` rejects unsigned requests once `CHECKR_ENV` is
`production` (staging accepted them, so this path has **never run**).

- A wrong key looks identical to a forgery: **401**, no detail.
- So: after the first production check starts (step 6), watch the logs and
  confirm a **200**. Do not assume.

```bash
supabase functions logs checkr-webhook
```

Look for the line `checkr-webhook: sig_present=true sig_ok=true staging=false`.
If `sig_ok=false`, the key in `CHECKR_API_KEY` is not the one Checkr is signing
with — recheck step 1 before anything else.

### 6. One real check, on Suresh (Suresh, phone)

This is the one moment going live is the right test.

1. On a courier account, run the background check through the app as a courier
   would.
2. Expect: Checkout (or not, if Admin → Background Checks is set to "Spetza
   covers"), then the Checkr invitation, then a real report.
3. Watch for:
   - `checkr-webhook` returning **200** with `sig_ok=true`
   - `background_check_status` moving `not_started` → `pending` → `clear`
   - the courier's own email from Checkr

```bash
supabase db query --linked "select first_name, background_check_status, checkr_candidate_id, checkr_report_id, background_check_updated_at from profiles where account_type='courier' order by background_check_updated_at desc nulls last limit 5"
```

A real report can take 40 minutes to several days depending on the package.
`pending` is not a failure.

### 7. Only then, real couriers

Do not run the recruiting ads until step 6 shows `clear` written by Checkr's own
webhook.

---

## Rollback

If anything is wrong, go back to staging in one step — nothing is destroyed:

```bash
supabase secrets set CHECKR_ENV=staging
supabase secrets set CHECKR_API_KEY='<staging key>'
supabase secrets set CHECKR_PACKAGE_SLUG='<staging slug>'
supabase functions deploy start-background-check checkr-webhook
```

Candidates and reports already created in production stay there; couriers whose
status is `pending` against a production report will simply stop updating until
you switch back.

---

## Known gaps, decided not to block on

- **Work location is hardcoded** to US/IL/Chicago
  (`start-background-check/index.ts`). Correct for the Chicago launch; derive it
  from the courier's profile before expanding.
- **Consider / adverse-action paths** are untested unless step A is done first.
- Checkr asked for an optional
  [implementation survey](https://docs.google.com/forms/d/e/1FAIpQLSfqL35wt2VfWiC5EKc0i-fU9sOamgF-PX6g2oVCSTkLW2BboA/viewform).
