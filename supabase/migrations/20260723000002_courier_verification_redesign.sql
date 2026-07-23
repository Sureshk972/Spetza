-- Courier verification redesign. Replaces the manual 3-doc review with
-- selfie + Connect KYC + Checkr background check. Drops the old
-- verification_status/documents model. Adds an email-allowlist admin
-- bootstrap and a webhook dead-letter table.

-- 1. New background-check status enum on profiles.
create type background_check_status_enum as enum
  ('not_started', 'pending', 'clear', 'consider', 'rejected');

alter table public.profiles
  add column if not exists selfie_path text,
  add column if not exists background_check_status background_check_status_enum
    not null default 'not_started',
  add column if not exists checkr_candidate_id text,
  add column if not exists checkr_report_id text,
  add column if not exists checkr_invitation_id text,
  add column if not exists background_check_updated_at timestamptz,
  add column if not exists background_check_notes text,
  add column if not exists background_check_reviewed_by uuid references auth.users(id),
  add column if not exists background_check_reviewed_at timestamptz;

-- 2. Remove the old manual-review model. review-verification edge fn is
--    deleted separately. The admin-reads-all-profiles policy from the old
--    migration stays (still used by the consider queue).
drop table if exists public.verification_documents;

alter table public.profiles
  drop column if exists verification_status,
  drop column if exists verification_submitted_at,
  drop column if exists verification_reviewed_at,
  drop column if exists verification_reviewer_id,
  drop column if exists verification_notes;

drop type if exists verification_status_enum;
drop type if exists verification_doc_type;

-- 3. Webhook dead-letter: events we couldn't match to a profile.
create table if not exists public.checkr_webhook_deadletter (
  id bigserial primary key,
  event_type text,
  candidate_id text,
  payload jsonb,
  reason text,
  created_at timestamptz default now()
);

alter table public.checkr_webhook_deadletter enable row level security;
create policy "service_role manages checkr deadletter"
  on public.checkr_webhook_deadletter
  for all to service_role using (true) with check (true);

-- 4. Admin bootstrap that survives user wipes. The allowlist is a
--    separate table, so clearing auth.users never removes it. A BEFORE
--    trigger sets is_admin from the row's auth email.
create table if not exists public.admin_allowlist (
  email text primary key
);

-- Seed the operator. Replace with the real admin email at apply time.
insert into public.admin_allowlist (email)
values ('rooblix2000@gmail.com')
on conflict (email) do nothing;

create or replace function public.apply_admin_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = new.id;
  if v_email is not null
     and exists (select 1 from public.admin_allowlist a where a.email = v_email) then
    new.is_admin := true;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_apply_admin_allowlist on public.profiles;
create trigger profiles_apply_admin_allowlist
  before insert or update on public.profiles
  for each row execute function public.apply_admin_allowlist();
