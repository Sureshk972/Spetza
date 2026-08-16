-- Track Stripe Checkout Session for the $40 background check payment.
-- Couriers pay before the Checkr invitation is created.

alter table public.profiles
  add column if not exists bgcheck_checkout_session_id text,
  add column if not exists bgcheck_paid_at timestamptz;

-- Protect from client-side tampering: add to the existing guard trigger.
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
  new.is_admin                      := old.is_admin;
  new.background_check_status       := old.background_check_status;
  new.checkr_candidate_id           := old.checkr_candidate_id;
  new.checkr_report_id              := old.checkr_report_id;
  new.checkr_invitation_id          := old.checkr_invitation_id;
  new.background_check_notes        := old.background_check_notes;
  new.background_check_reviewed_by  := old.background_check_reviewed_by;
  new.background_check_reviewed_at  := old.background_check_reviewed_at;
  new.background_check_updated_at   := old.background_check_updated_at;
  new.is_suspended                  := old.is_suspended;
  new.bgcheck_checkout_session_id   := old.bgcheck_checkout_session_id;
  new.bgcheck_paid_at               := old.bgcheck_paid_at;
  new.earnback_credited_cents       := old.earnback_credited_cents;

  return new;
end;
$$;
