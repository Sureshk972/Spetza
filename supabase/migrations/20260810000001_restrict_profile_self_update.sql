-- Restrict profile self-updates so users cannot escalate privileges.
--
-- The old "self update profiles" policy allowed unrestricted column updates,
-- meaning any user could set is_admin = true or background_check_status = 'clear'.
--
-- Fix: a BEFORE UPDATE trigger rejects changes to privileged columns unless
-- the session role is service_role (edge functions) or the user is an admin.
-- This is simpler and safer than RLS WITH CHECK subselects that risk recursion.

-- Step 1: Guard trigger — revert privileged columns to OLD values for
-- non-privileged callers.  Admins (via "admin updates profiles" policy)
-- and service_role (edge functions) are exempt.
create or replace function public.guard_profile_privileged_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role calls (edge functions) are always trusted
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;

  -- Admins may update any column (they have their own RLS policy)
  if coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false) then
    return new;
  end if;

  -- Regular users: force privileged columns back to their old values
  new.is_admin                    := old.is_admin;
  new.background_check_status     := old.background_check_status;
  new.checkr_candidate_id         := old.checkr_candidate_id;
  new.checkr_report_id            := old.checkr_report_id;
  new.checkr_invitation_id        := old.checkr_invitation_id;
  new.background_check_notes      := old.background_check_notes;
  new.background_check_reviewed_by := old.background_check_reviewed_by;
  new.background_check_reviewed_at := old.background_check_reviewed_at;
  new.background_check_updated_at := old.background_check_updated_at;
  new.is_suspended                := old.is_suspended;

  return new;
end;
$$;

drop trigger if exists guard_profile_privileged_cols on public.profiles;
create trigger guard_profile_privileged_cols
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_cols();

-- Step 2: Add RLS to admin_allowlist (was missing — critical finding).
alter table public.admin_allowlist enable row level security;

-- Only service_role (edge functions / migrations) can read/write this table.
create policy "service_role manages admin_allowlist"
  on public.admin_allowlist
  for all to service_role using (true) with check (true);
