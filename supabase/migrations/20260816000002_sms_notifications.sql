-- SMS notification opt-in for TCPA compliance.
-- Defaults to true for couriers (they need delivery alerts),
-- false for senders (email + push is enough until they opt in).

alter table public.profiles
  add column if not exists sms_notifications_enabled boolean
    default true;

-- Let users read and toggle their own preference.
-- RLS already covers profiles, so no new policy needed.

comment on column public.profiles.sms_notifications_enabled is
  'User opt-in for SMS delivery notifications (TCPA). Null treated as true for couriers.';
