# Firebase + Push Notification Setup

## Firebase Console

1. Go to https://console.firebase.google.com
2. Create project: "spetza"
3. Register iOS app: bundle ID `com.spetza.app`
   - Download `GoogleService-Info.plist` → `ios/App/App/GoogleService-Info.plist`
4. Register Android app: package `com.spetza.app`
   - Download `google-services.json` → `android/app/google-services.json`
5. Go to Project Settings → Service Accounts → Generate new private key
   - Save the JSON file securely

## Supabase Secrets

Set these via Supabase dashboard or CLI:

```bash
supabase secrets set FCM_SERVICE_ACCOUNT_JSON='{"project_id":"spetza-XXXXX","client_email":"...","private_key":"..."}'
```

## Stripe Connect Webhook

1. In Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://ggjjoagjurlirdaenttp.supabase.co/functions/v1/stripe-connect-webhook`
3. Events: `transfer.paid`
4. Copy the signing secret

```bash
supabase secrets set STRIPE_CONNECT_WEBHOOK_SECRET='whsec_...'
```

## iOS: APNs Key (required for FCM on iOS)

1. Apple Developer → Certificates, Identifiers & Profiles → Keys
2. Create a new key with Apple Push Notifications service (APNs) enabled
3. Download the .p8 file
4. In Firebase Console → Project Settings → Cloud Messaging → iOS app
5. Upload the APNs key (.p8), enter Key ID and Team ID

## Android: No additional setup needed

FCM works out of the box with `google-services.json`.

## Env vars summary

| Variable | Where | Description |
|---|---|---|
| `FCM_SERVICE_ACCOUNT_JSON` | Supabase secret | Google service account key JSON |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Supabase secret | Stripe webhook signing secret |
| `GoogleService-Info.plist` | `ios/App/App/` | Firebase iOS config (committed) |
| `google-services.json` | `android/app/` | Firebase Android config (committed) |
