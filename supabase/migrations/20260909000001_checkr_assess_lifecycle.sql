-- Checkr Assess + Report Lifecycle support.
--
-- Required by Checkr's Customer API Integration Guidance v3.0 for production
-- API authorization:
--   * "First look at the assessment field and, if any value exists in that
--      field, use that value; if no value exists, use the value from the
--      result field."
--   * Listen for report.canceled and display an appropriate status.
--   * Read includes_canceled on report.completed and display an appropriate
--     status (a partially completed report is not a plain clear).
--
-- background_check_status stays the courier-accept gate and keeps its existing
-- five values. These columns carry what Checkr wants displayed, so the gate
-- logic is untouched by the richer vocabulary.

alter table public.profiles
  add column if not exists checkr_assessment text,
  add column if not exists checkr_includes_canceled boolean,
  add column if not exists checkr_report_status text,
  add column if not exists checkr_display_status text;

comment on column public.profiles.checkr_assessment is
  'Checkr Assess tag (eligible / review / escalated). Takes precedence over result when present.';
comment on column public.profiles.checkr_includes_canceled is
  'True when the report completed with one or more canceled screenings.';
comment on column public.profiles.checkr_report_status is
  'Raw Checkr report status: pending / complete / suspended / dispute / canceled.';
comment on column public.profiles.checkr_display_status is
  'Human label from Checkr''s webhook/status mapping table, e.g. "Clear w/ canceled screenings".';

-- These are Checkr-owned, same as the other checkr_* columns: a courier must
-- never be able to write them from the client.
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
  new.checkr_assessment           := old.checkr_assessment;
  new.checkr_includes_canceled    := old.checkr_includes_canceled;
  new.checkr_report_status        := old.checkr_report_status;
  new.checkr_display_status       := old.checkr_display_status;
  new.background_check_notes      := old.background_check_notes;
  new.background_check_reviewed_by := old.background_check_reviewed_by;
  new.background_check_reviewed_at := old.background_check_reviewed_at;
  new.background_check_updated_at := old.background_check_updated_at;
  new.is_suspended                := old.is_suspended;
  new.deleted_at                  := old.deleted_at;

  return new;
end;
$$;
