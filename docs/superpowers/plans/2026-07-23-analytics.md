# Spetza Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement comprehensive event-based analytics using Mixpanel across client and server layers to track marketplace health, conversion funnels, and user behavior.

**Architecture:** Client-side React SDK tracks UX/user-intent events. Server-side edge functions track operational ground-truth events. Both send to the same Mixpanel project keyed on Supabase `user.id`. Failed events fall back to a Supabase table for retry.

**Tech Stack:** Mixpanel (event analytics), React (client), Deno (edge functions), Supabase (fallback storage)

**Spec:** `docs/superpowers/specs/2026-07-23-analytics-design.md`

---

## Correctness note (learned during Task 1)

Mixpanel's `mixpanel.set_config()` sets **library configuration**, NOT user profile
properties. User properties (email, role, zip) MUST be set with
`mixpanel.people.set(properties)`. Any task that sets user attributes uses
`people.set`. Unit-test mocks must mirror the real API shape
(`{ people: { set: fn } }`), or a green test can hide a broken integration.

---

## Task 1: Create Analytics Wrapper Library ✓ (done, commit 7b738c7 + fix)

**Files:** `src/lib/analytics.js`, `src/lib/analytics.test.js`

Exports: `initAnalytics(token)`, `trackEvent(eventName, properties)`,
`identifyUser(userId, properties)`, `resetAnalytics()`. All guard on
`window.mixpanel`, catch errors, and never throw. `identifyUser` uses
`window.mixpanel.people.set(properties)` (see correctness note).

## Task 2: Initialize Mixpanel in App Startup

**Files:** Modify `src/main.jsx` — call `initAnalytics(import.meta.env.VITE_MIXPANEL_TOKEN)` before render.

## Task 3: Set Environment Variables

**Files:** `.env.local` — add `VITE_MIXPANEL_TOKEN`. Add `MIXPANEL_TOKEN` to Supabase secrets. Do NOT commit `.env.local`.

## Task 4: Track Onboarding Events (Client)

**Files:** `src/pages/SignUp.jsx`, `src/pages/onboarding/PhoneVerify.jsx`, `src/pages/onboarding/NameCapture.jsx`, `src/pages/Welcome.jsx`
Events: `role_selected`, `signup_completed`, `phone_verification_completed`, `name_capture_completed`.

## Task 5: Track Delivery Posting (Client)

**Files:** `src/pages/sender/NewRequest.jsx` — event `delivery_posted` with `delivery_id`, `pickup_zip`, `dropoff_zip`, `distance_miles`, `pickup_price`.

## Task 6: Track Delivery Acceptance (Server)

**Files:** `supabase/functions/accept-delivery/index.ts` — event `delivery_accepted`.

## Task 7: Track Delivery Completion + Payment (Server)

**Files:** `supabase/functions/complete-delivery/index.ts` — events `delivery_completed`, `payment_captured`.

## Task 8: Create Fallback Analytics Table

**Files:** `supabase/migrations/20260723000001_analytics_fallback.sql` — table `analytics_events_fallback`, service_role RLS.

## Task 9: Add Error Recovery to Edge Functions

**Files:** `accept-delivery`, `complete-delivery` — `safeTrackEvent()` helper writes to fallback table on Mixpanel failure.

## Task 10: Integration Tests

**Files:** `tests/analytics.integration.test.js` — fallback table insert/query/update.

## Task 11: Document Analytics Instrumentation

**Files:** `docs/analytics-instrumentation.md` — quick-start + taxonomy pointer.

## Task 12: Final Deployment and Verification

Build, deploy edge functions, verify events land in Mixpanel Live View, push.

---

Full per-step code, commands, and expected output for each task were presented
inline during planning; the design spec is the source of truth for the event
taxonomy, dashboards, and properties.
