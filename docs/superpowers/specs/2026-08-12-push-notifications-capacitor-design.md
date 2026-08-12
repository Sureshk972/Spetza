# Push Notifications + Capacitor Native Shell

**Date:** 2026-08-12
**Status:** Approved

## Overview

Wrap the existing Spetza Vite+React SPA in Capacitor for iOS and Android. Wire push notifications via Firebase Cloud Messaging (FCM) for delivery lifecycle events, background check updates, and payment confirmations. The web app stays live on Netlify — same codebase, three targets.

## Platforms

- iOS and Android from day one (couriers skew Android)
- Web remains live alongside native apps
- Bundle ID: `com.spetza.app` (both platforms)

## Architecture

```
Postgres trigger → send-notification edge fn → email (existing)
                                              → FCM push (new)

App launch → register device → store FCM token in push_tokens table
```

Push notifications are fire-and-forget, same as existing emails. No in-app notification inbox — pushes + email cover it.

## 1. Capacitor Shell

### Dependencies

- `@capacitor/core`, `@capacitor/cli`
- `@capacitor/ios`, `@capacitor/android`
- `@capacitor/push-notifications`
- `@capacitor/splash-screen`
- `@capacitor/status-bar`
- `@capacitor/app` (deep link / Android back button)

### Config

- `capacitor.config.ts` with `webDir: 'dist'`
- iOS project at `ios/`, Android project at `android/`
- Build flow: `npm run build` → `npx cap sync` → Xcode / Android Studio

### Netlify

Unchanged. Web users are unaffected. Same `dist/` output, same SPA redirect.

## 2. Push Token Storage

### New table: `push_tokens`

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, gen_random_uuid() |
| user_id | uuid | FK → auth.users, ON DELETE CASCADE |
| token | text | UNIQUE — FCM registration token |
| platform | text | CHECK: 'ios', 'android', 'web' |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

### RLS

- Users can INSERT and DELETE their own tokens only
- Service role (edge functions) can SELECT all tokens for a given user_id

### Lifecycle

- **Login:** request permission → register → upsert token
- **Logout:** delete token row
- **Token refresh:** Capacitor fires an event; upsert new token, old one naturally expires in FCM

## 3. Push Notification Events

### Delivery lifecycle (existing trigger extended)

| Event | Recipient | Push Title |
|---|---|---|
| `created` | Nearby couriers (haversine fan-out) | "New delivery near you — $X, X.X mi" |
| `accepted` | Sender | "Your delivery SPZ-XXXXX has been accepted" |
| `picked_up` | Sender | "Your package has been picked up" |
| `delivered` | Sender + Courier | "Package delivered!" / "Delivery complete — $X earned" |
| `cancelled` | Courier (if assigned) | "Delivery SPZ-XXXXX was cancelled" |

### Background check (new trigger on profiles)

| Event | Recipient | Push Title |
|---|---|---|
| `background_check_clear` | Courier | "You're approved to accept deliveries!" |
| `background_check_rejected` | Courier | "Your background check needs attention" |

### Payment (new trigger points in existing edge functions)

| Event | Recipient | Push Title |
|---|---|---|
| `payout_completed` | Courier | "Payout of $X.XX is on its way" |
| `payment_captured` | Sender | "Payment of $X.XX processed for SPZ-XXXXX" |

### Fan-out for "new order near you"

The `created` event queries `profiles` for couriers where:
- `account_type = 'courier'`
- `verification_status = 'approved'` (or `background_check_status = 'clear'`)
- Haversine distance from pickup to courier's `home_lat/home_lng` ≤ courier's `service_radius_miles`

Then batch-fetches their push tokens and sends in parallel. This reuses the same haversine logic from the courier discover page.

## 4. Edge Function Changes

### `send-notification/index.ts` — extend

After sending email:
1. Query `push_tokens` for the recipient's `user_id`
2. For each token, send via FCM HTTP v1 API:
   ```
   POST https://fcm.googleapis.com/v1/projects/{project_id}/messages:send
   Authorization: Bearer {oauth2_token}
   ```
3. Construct message with `notification` (title + body) and `data` (event type, delivery_request_id, deep link path)
4. If push fails, log and continue — never fail the trigger

For `created` events, also run the haversine fan-out query and push to all matching couriers.

### New env var

- `FCM_SERVICE_ACCOUNT_JSON` — Google service account key JSON, stored as Supabase secret. Used to mint short-lived OAuth2 tokens for the FCM v1 API.

### New trigger points

- **`checkr-webhook/index.ts`** — after updating `background_check_status` to `clear` or `rejected`, invoke `send-notification` with the appropriate event
- **`complete-delivery/index.ts`** — after capturing payment, invoke `send-notification` with `payment_captured`
- **Payout notification** — add a Stripe Connect webhook handler for `transfer.paid` events, invoke `send-notification` with `payout_completed`

## 5. Frontend Changes

### New files

- **`src/lib/push.js`** — push registration, permission prompt, token upsert/cleanup
  - `initPush(userId)` — called after auth, requests permission, registers, upserts token
  - `teardownPush(userId)` — called on logout, deletes token
  - No-ops on web (push is native-only at launch)
- **`src/lib/capacitor.js`** — platform detection and native helpers
  - `isNative()` — returns true on iOS/Android
  - `getPlatform()` — returns 'ios', 'android', or 'web'
  - Status bar config (dark content on light bg)
  - Splash screen dismiss after first render
  - Android back button handling

### Push tap deep links

| Event | Deep link |
|---|---|
| Delivery events | `/sender/requests/:id` or `/courier/deliveries/:id` |
| Background check | `/courier/verify` |
| Payout | `/courier/profile` |

### Platform-specific UI

- Extend `env(safe-area-inset-*)` usage to all screens
- Status bar styling via `@capacitor/status-bar`
- Splash screen dismiss via `@capacitor/splash-screen`
- Android hardware back button via `@capacitor/app`

### Web

No changes. Web stays email-only. Web Push API is a future additive change if needed.

## 6. Firebase Project Setup

- One Firebase project: "spetza"
- Register iOS app: `com.spetza.app`
- Register Android app: `com.spetza.app`
- Download `GoogleService-Info.plist` → `ios/App/App/`
- Download `google-services.json` → `android/app/`
- Create service account → export key JSON → store as `FCM_SERVICE_ACCOUNT_JSON` Supabase secret

## 7. Not in Scope

- Web Push API (future)
- In-app notification inbox / history
- Notification preferences / mute controls
- Rich media in push (images, action buttons)
- Capacitor live update (Appflow / Capgo)
