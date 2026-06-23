-- Phone verification on profiles. Backed by Twilio Verify, which owns
-- the OTP lifecycle (code generation, expiry, attempts). We only store
-- the resolved phone and a timestamp once verification succeeds.

alter table public.profiles
  add column if not exists phone_number text,
  add column if not exists phone_verified_at timestamptz;

-- One phone per account. Partial index so multiple unverified rows
-- (phone_number IS NULL) don't conflict.
create unique index if not exists profiles_phone_number_unique
  on public.profiles (phone_number)
  where phone_number is not null;

-- Public-facing boolean: callers only need to know if a profile is
-- verified, not when. The raw timestamp is hidden below.
alter table public.profiles
  add column if not exists is_phone_verified boolean
  generated always as (phone_verified_at is not null) stored;

-- Hide the raw timestamp from anon/authenticated clients. service_role
-- (used by verify-otp) keeps full access.
revoke select (phone_verified_at) on public.profiles from anon, authenticated;
