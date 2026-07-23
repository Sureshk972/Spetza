# Spetza Analytics Design

**Date:** 2026-07-23  
**Status:** Approved  
**Author:** Claude

## Overview

Comprehensive event-based analytics for Spetza to measure marketplace health, conversion funnels, and user behavior across sender and courier surfaces. Two-layer architecture: client-side tracking (React SDK) for UX flows, server-side tracking (edge functions) for operational ground truth.

## Goals

1. **Marketplace Health** — Track acceptance rates, completion rates, repeat users, and geographic hotspots
2. **Conversion Funnels** — Identify drop-off points in sender and courier onboarding
3. **User Behavior** — Understand engagement patterns, retention, and feature adoption

## Provider: Mixpanel

**Why:** Event-based model fits marketplace workflows. Built-in funnel analysis. Generous free tier (1M events/month). Easy React SDK integration. Works seamlessly from edge functions.

**Cost:** Free tier sufficient for early stage. No credit card required to start.

## Architecture

### Two-Layer Design

**Client Layer (Mixpanel React SDK)**
- Captures user intent and UX flows
- Events: signup, role selection, phone verification, name entry, payment setup, delivery posting, ratings
- Initialized in `src/main.jsx`, called from React components
- Graceful degradation: tracking errors don't break the app

**Server Layer (Edge Functions)**
- Captures operational ground truth: what actually happened
- Events: delivery accepted, picked up, completed, payment captured, courier verified
- Mixpanel SDK imported in edge functions, called after operations complete
- Errors logged to fallback table; don't block main operation

**User Identity**
- Primary identifier: `user_id` = Supabase `auth.users.id` (UUID)
- Sent with every event so Mixpanel builds user profiles and cohorts
- `mixpanel.identify(user.id)` called when user signs in

**Enriched User Properties (Mixpanel)**
- `role` — "sender" or "courier"
- `email`, `phone`, `first_name`
- `created_at`, `is_phone_verified`
- `user_zip` — user's primary zip code (from profile)
- `stripe_customer_id` (senders), `stripe_connect_account_id` (couriers)

## Event Taxonomy

### Authentication & Onboarding (Client)

| Event | Trigger | Properties |
|-------|---------|------------|
| `signup_started` | User navigates to /signup | none |
| `signup_completed` | `auth.signUp()` succeeds | `role` (stashed from Welcome) |
| `role_selected` | User picks sender/courier on Welcome | `role` |
| `phone_verification_started` | User enters phone on /verify-phone | none |
| `phone_verification_completed` | OTP verified | `phone_provider` (Twilio) |
| `name_capture_completed` | User submits name on /name | `first_name`, `has_last_name` |
| `payment_method_added` | Sender saves Stripe PM | `payment_method_type` (e.g., "card") |
| `service_area_set` | Courier defines delivery radius | `radius_miles` |

### Delivery Lifecycle (Server)

| Event | Trigger | Properties |
|-------|---------|------------|
| `delivery_posted` | Sender creates delivery_request | `delivery_id`, `pickup_zip`, `dropoff_zip`, `distance_miles`, `pickup_price`, `app_version` |
| `delivery_discovered` | Courier sees delivery in discovery | `delivery_id`, `distance_from_courier_miles` |
| `delivery_accepted` | Courier accepts, Stripe PI authorized | `delivery_id`, `pickup_price`, `courier_id`, `authorization_status` |
| `delivery_picked_up` | Courier marks picked up | `delivery_id`, `time_to_pickup_minutes` |
| `delivery_completed` | Courier marks delivered, PI captured | `delivery_id`, `total_duration_minutes`, `capture_status` |
| `delivery_cancelled` | Sender or courier cancels | `delivery_id`, `cancelled_by` (sender/courier), `cancellation_reason` |
| `delivery_abandoned` | Courier accepted but didn't complete | `delivery_id`, `time_since_acceptance_hours` |

### Ratings & Reviews (Client)

| Event | Trigger | Properties |
|-------|---------|------------|
| `rating_prompted` | User sees rating screen post-delivery | `delivery_id`, `counterparty_role` |
| `rating_submitted` | User submits stars + comment | `delivery_id`, `stars`, `has_comment` |

### Stripe Events (Server)

| Event | Trigger | Properties |
|-------|---------|------------|
| `payment_authorized` | Manual-capture PI authorized on accept | `delivery_id`, `amount_cents`, `status` |
| `payment_captured` | PI captured on delivery completion | `delivery_id`, `amount_cents`, `status` |
| `payment_failed` | Capture/auth failed | `delivery_id`, `error_code`, `error_message` |
| `stripe_connect_account_created` | Courier onboards Connect | `courier_id`, `account_id` |
| `stripe_connect_payouts_enabled` | Bank account verified | `courier_id`, `charges_enabled`, `payouts_enabled` |

### Engagement (Client)

| Event | Trigger | Properties |
|-------|---------|------------|
| `inbox_viewed` | User opens Inbox tab | `role` |
| `profile_viewed` | User opens Profile tab | `role` |
| `request_detail_viewed` | Sender views delivery details | `delivery_id`, `view_duration_seconds` |
| `delivery_card_viewed` | Courier views delivery card | `delivery_id`, `view_duration_seconds` |

### Error & Support (Client + Server)

| Event | Trigger | Properties |
|-------|---------|------------|
| `error_occurred` | Caught error | `error_type`, `error_message`, `page_or_function` |

### Global Properties (All Events)

Every event includes:
- `user_id` (Supabase UUID)
- `timestamp` (ISO 8601)
- `app_version` (from package.json)
- `role` ("sender" or "courier", if user is authenticated)

## Dashboards & Metrics

### Dashboard 1: Marketplace Health

**Purpose:** Understand the core two-sided flow and identify growth opportunities.

**Metrics:**
- **Deliveries posted (daily trend)** — volume of new delivery requests
- **Acceptance rate** — % of posted deliveries that get accepted (goal: > 80%)
- **Completion rate** — % of accepted deliveries that are completed vs. cancelled/abandoned
- **Average delivery value** — mean pickup price, segmented by zip code
- **Repeat sender rate** — % of senders who post > 1 delivery (retention proxy)
- **Repeat courier rate** — % of couriers who complete > 1 delivery (retention proxy)
- **Geographic hotspots** — deliveries posted/completed by zip code (identify active zones)
- **Median time to acceptance** — how long after posting does a delivery get accepted?
- **Median delivery duration** — pickup to completion time

### Dashboard 2: Conversion Funnels

**Purpose:** Identify and fix onboarding drop-off.

**Sender funnel:**
Signup → Role selected → Phone verified → Name entered → Payment method saved → Delivery posted → Delivery accepted

**Courier funnel:**
Signup → Role selected → Phone verified → Name entered → Service area set → Delivery accepted

**Metrics:**
- Drop-off % at each step
- Time spent at each step (median, p95)
- Cohort retention (week-over-week for each signup cohort)
- Funnel completion rate by date (to catch regressions)

### Dashboard 3: User Behavior & Engagement

**Purpose:** Understand how users interact with the app.

**Metrics:**
- **Inbox engagement** — % of active users viewing Inbox weekly
- **Profile customization** — % of users who edit their profile (name, service area, payment)
- **Delivery card dwell time** — average seconds spent viewing a delivery card (courier)
- **Ratings participation** — % of completed deliveries that receive a rating
- **Error rate by type** — frequency of each error (helps prioritize fixes)
- **Session retention** — week-over-week cohort retention; do first-time users return?
- **Daily active users (DAU)** — count of unique users per day, by role

### Dashboard 4: Payment & Financials

**Purpose:** Monitor payment health and courier economics.

**Metrics:**
- **Revenue by delivery** — total platform take (sum of pickup_price × platform_fee_rate) by week/month
- **Payout readiness** — % of couriers with `stripe_connect_payouts_enabled = true`
- **Payment success rate** — % of Stripe charges (authorize + capture) that succeed vs. fail
- **Failed payment reasons** — breakdown of payment failures by error code
- **Average earnings per courier** — total completed deliveries × average take rate
- **Stripe fee impact** — % of revenue consumed by Stripe fees

## Data Quality & Privacy

**Validation:**
- Event properties validated before sending (price is number, user_id is UUID, etc.)
- Deduplicate events on retries using idempotent keys
- Sample high-volume events (e.g., card views) if needed later to control costs

**Privacy:**
- Track zip codes, never full addresses
- Never send Stripe tokens, card details, passwords
- Respect future user privacy preferences
- Mixpanel's default: 2-year data retention (acceptable for early stage)

## Error Handling

**Client-side:**
- Wrap `mixpanel.track()` in try-catch; errors don't break the app
- If Mixpanel SDK fails to load, app continues normally
- Log tracking failures to browser console for debugging

**Server-side (edge functions):**
- Wrap `mixpanel.track()` in try-catch
- On failure, log event to Supabase fallback table `analytics_events_fallback`
- Background job (or manual Deno cron) retries failed events weekly
- Don't block main operation (e.g., delivery completion succeeds even if Mixpanel fails)

**Monitoring:**
- Alert if Mixpanel API is unreachable for > 1 hour
- Monitor fallback table for accumulating events (indicates ongoing issue)

## Implementation

### Client-Side Setup

**Install Mixpanel:**
```bash
npm install mixpanel-browser
```

**Create `src/lib/analytics.js`:**
- Wrapper around Mixpanel SDK with safe `track()` and `identify()` methods
- Error handling: catch and log, don't throw
- Gracefully handle missing token (dev/test mode)

**Initialize in `src/main.jsx`:**
```javascript
import { initAnalytics } from './lib/analytics.js'
initAnalytics(import.meta.env.VITE_MIXPANEL_TOKEN)
```

**Call from components:**
- `SignUp.jsx`: `trackEvent('signup_completed', { role })`
- `PhoneVerify.jsx`: `trackEvent('phone_verification_completed')`
- `NameCapture.jsx`: `trackEvent('name_capture_completed')`
- `NewRequest.jsx`: `trackEvent('delivery_posted', { pickup_zip, dropoff_zip, distance_miles, pickup_price })`
- etc.

**Environment:**
- Add `VITE_MIXPANEL_TOKEN` to `.env.local` (public, client-side safe)

### Server-Side Setup

**Edge functions:**
- Import Mixpanel: `import Stripe from "https://esm.sh/mixpanel@latest"`
- Create helper: `async function trackEvent(userId, eventName, properties) { ... }`
- Call after key operations:
  - `accept-delivery` edge fn: track `delivery_accepted`
  - `complete-delivery` edge fn: track `delivery_completed`, `payment_captured`
  - `review-verification` edge fn: track `courier_verified`
  - etc.

**Environment:**
- Add `MIXPANEL_TOKEN` to Supabase edge function secrets (same token as client)

### Testing

**Unit tests:**
- Test `analytics.js` wrapper: verify track/identify format correct, errors caught
- Mock Mixpanel SDK, verify calls are made with correct properties

**Integration tests:**
- Sign up through Mixpanel → verify `signup_completed` event in Mixpanel
- Post delivery → verify `delivery_posted` event with zip codes and price
- Accept delivery → verify `delivery_accepted` event from edge fn

**Manual testing:**
- Complete full sender funnel (signup → post delivery → get acceptance)
- Complete full courier funnel (signup → accept delivery → complete)
- Check Mixpanel dashboard: all events appear with correct properties
- Verify geographic hotspot heatmap shows correct zip codes

## Rollout

**Phase 1: Minimal setup**
- Install Mixpanel, create wrapper
- Instrument key events: signup, role, phone, name, delivery_posted, delivery_accepted, delivery_completed
- Verify events in Mixpanel
- Deploy to staging

**Phase 2: Comprehensive**
- Add all remaining events from taxonomy
- Build all four dashboards
- Deploy to production
- Monitor for 1 week, fix any data quality issues

## Success Criteria

- All events from taxonomy appear in Mixpanel within 5 minutes of trigger
- Sender and courier funnels show <20% drop-off at each step
- Marketplace health dashboard shows acceptance rate > 80%
- No tracking errors block app operations
- Data quality: <1% of events have missing or invalid properties

## Out of Scope

- Custom events beyond the taxonomy
- A/B testing (feature flags) — separate project
- Real-time alerting (can be added later via Mixpanel webhooks)
- Multi-region analytics (all data goes to single Mixpanel project)
