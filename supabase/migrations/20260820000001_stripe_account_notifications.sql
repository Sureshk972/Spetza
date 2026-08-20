-- Support account.updated notifications from stripe-connect-webhook.
--
-- Stripe emits account.updated frequently — every requirement change, every
-- verification step. Without a throttle, the "Stripe needs more info" email
-- would fire on every one of those. This column records when we last told
-- the courier, so the webhook can rate-limit to once per 24h and re-arm
-- once their requirements are cleared.

alter table public.profiles
  add column if not exists stripe_requirements_notified_at timestamptz;

comment on column public.profiles.stripe_requirements_notified_at is
  'Last time we emailed this courier that Stripe needs more info. Throttles '
  'repeat notifications; cleared when requirements are resolved.';

-- Also close a pre-existing gap while we are here: the stripe_* columns were
-- never in the privileged guard list, so a regular user could set their own
-- stripe_connect_payouts_enabled = true. canAcceptDeliveries() and the
-- accept-delivery-request edge function both read those flags off the
-- profile row, so that was a real path to bypassing the payout gate.
-- Verified no client code writes these columns — they are set exclusively by
-- connect-courier, refresh-connect-status, and this webhook.
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
  new.is_admin                        := old.is_admin;
  new.background_check_status         := old.background_check_status;
  new.checkr_candidate_id             := old.checkr_candidate_id;
  new.checkr_report_id                := old.checkr_report_id;
  new.checkr_invitation_id            := old.checkr_invitation_id;
  new.background_check_notes          := old.background_check_notes;
  new.background_check_reviewed_by    := old.background_check_reviewed_by;
  new.background_check_reviewed_at    := old.background_check_reviewed_at;
  new.background_check_updated_at     := old.background_check_updated_at;
  new.is_suspended                    := old.is_suspended;
  new.bgcheck_checkout_session_id     := old.bgcheck_checkout_session_id;
  new.bgcheck_paid_at                 := old.bgcheck_paid_at;
  new.earnback_credited_cents         := old.earnback_credited_cents;

  -- Stripe state — server-owned, newly guarded
  new.stripe_connect_account_id       := old.stripe_connect_account_id;
  new.stripe_connect_charges_enabled  := old.stripe_connect_charges_enabled;
  new.stripe_connect_payouts_enabled  := old.stripe_connect_payouts_enabled;
  new.stripe_customer_id              := old.stripe_customer_id;
  new.stripe_default_payment_method_id := old.stripe_default_payment_method_id;
  new.stripe_requirements_notified_at := old.stripe_requirements_notified_at;

  return new;
end;
$$;
