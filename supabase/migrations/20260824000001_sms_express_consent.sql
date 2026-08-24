-- A2P 10DLC: SMS consent must be express opt-in, never a default.
--
-- Campaign CMcac8fdb01facd5ab5fa05af51dbca2fa was rejected (error 30923,
-- "forced consent") because signup bundled SMS consent into the mandatory
-- Terms checkbox AND this column defaulted to true — so every account was
-- enrolled in messaging without ever being asked.
--
-- New rule: only an explicit `true`, written when the user ticks the optional
-- box beside the phone field, authorizes an SMS. Null and false both mean
-- "no consent" (see _shared/sms.ts, which now gates on === true rather than
-- !== false, so the null case can never fall through to sending).

alter table public.profiles
  add column if not exists sms_consent_at timestamptz;

comment on column public.profiles.sms_consent_at is
  'When the user affirmatively opted in to SMS. Null = never consented. '
  'Kept as the TCPA/carrier audit trail for sms_notifications_enabled.';

alter table public.profiles
  alter column sms_notifications_enabled set default false;

-- Every existing row was opted in by the old default, not by a choice --
-- the frontend never wrote this column at all. Reset them to no-consent;
-- they can opt in from Profile or at phone verification.
update public.profiles
  set sms_notifications_enabled = false
  where sms_consent_at is null
    and sms_notifications_enabled is distinct from false;

comment on column public.profiles.sms_notifications_enabled is
  'Express opt-in for SMS notifications (A2P 10DLC / TCPA). Only true sends. '
  'Never default this to true -- consent cannot be a condition of signup.';
