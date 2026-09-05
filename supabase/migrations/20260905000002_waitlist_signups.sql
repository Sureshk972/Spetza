-- Pre-launch waitlist for spetza.com.
--
-- The landing page is public, so this table is written by anonymous visitors.
-- Two consequences shape it:
--
-- 1. Anon gets INSERT and nothing else. Without a SELECT policy the list
--    cannot be read back by the public, so an open insert endpoint can't be
--    turned into an email-harvesting one.
-- 2. Anything a stranger can write, a stranger can write garbage into. The
--    column constraints below are the only validation that actually holds --
--    client-side checks are a courtesy, not a control.
--
-- Deliberately minimal: an email, and which side of the marketplace they came
-- for. No name, no phone, no IP. Nothing here is worth breaching, and a
-- pre-launch list is not a reason to start holding personal data.

create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),

  -- Stored lowercased and trimmed by the insert; the unique index below is
  -- what actually enforces one row per address.
  email text not null,

  -- Which side of the marketplace they signed up for, when they said. Drives
  -- who gets invited first at launch: couriers have to exist before a sender's
  -- first package can go anywhere.
  interest text check (interest in ('sender', 'courier')),

  created_at timestamptz not null default now()
);

-- Shape check, not a validity check. The only way to know an address is real
-- is to send to it, which is a launch-day problem, not a signup-time one.
alter table public.waitlist_signups
  drop constraint if exists waitlist_signups_email_shape;
alter table public.waitlist_signups
  add constraint waitlist_signups_email_shape
  check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and length(email) <= 254);

create unique index if not exists waitlist_signups_email_unique
  on public.waitlist_signups (lower(email));

create index if not exists waitlist_signups_created_idx
  on public.waitlist_signups (created_at desc);

alter table public.waitlist_signups enable row level security;

-- Anyone may add themselves. Note there is no `using` clause and no select
-- policy for anon: they can write, and can never read.
create policy "anyone may join the waitlist"
  on public.waitlist_signups for insert
  to anon, authenticated
  with check (true);

create policy "admins read the waitlist"
  on public.waitlist_signups for select
  to authenticated
  using (
    coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
  );

create policy "service_role manages the waitlist"
  on public.waitlist_signups for all
  to service_role using (true) with check (true);

comment on table public.waitlist_signups is
  'Pre-launch email list from the coming-soon page. Anon may insert, only '
  'admins may read. A duplicate signup is a no-op, not an error -- see '
  'ComingSoon.jsx.';
