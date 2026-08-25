-- Account deletion, as the Privacy Policy has always promised.
--
-- A hard delete is not available here. profiles and delivery_requests.sender_id
-- both cascade from auth.users, so deleting a sender would erase the delivery
-- history of every courier who ever worked for them; delivery_requests.courier_id
-- has no delete rule at all, so deleting a courier who has ever delivered would
-- simply fail on the foreign key.
--
-- So: scrub the personal data, keep the delivery and payment records the
-- counterparty and the tax authorities need, and lock the login. The person is
-- gone from the product; the transactions remain as anonymous rows.

alter table public.profiles
  add column if not exists deleted_at timestamptz;

comment on column public.profiles.deleted_at is
  'Set when the user deleted their account. The row survives with its personal '
  'fields scrubbed because other people''s delivery history references it.';

-- Deleted accounts must not appear as counterparties anywhere. Anything
-- listing people should filter on this.
create index if not exists profiles_deleted_idx
  on public.profiles (deleted_at)
  where deleted_at is not null;

-- The privileged-column guard reverts anything a regular user shouldn't set.
-- deleted_at joins that list: self-serve deletion goes through the edge
-- function, which runs as service_role, so a client can never flag itself
-- deleted (or, worse, un-delete itself).
create or replace function public.guard_profile_privileged_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;

  if coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false) then
    return new;
  end if;

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
  new.deleted_at                  := old.deleted_at;

  return new;
end;
$$;
