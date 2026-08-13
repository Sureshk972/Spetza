-- Protect liability timestamps from regular-user tampering
create or replace function public.guard_delivery_privileged_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role (edge functions) is always trusted
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;

  -- Admins are trusted
  if coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false) then
    return new;
  end if;

  -- Regular users: force state-machine and audit columns back to old values
  new.status                        := old.status;
  new.courier_id                    := old.courier_id;
  new.accepted_at                   := old.accepted_at;
  new.accepted_price_cents          := old.accepted_price_cents;
  new.platform_fee_cents            := old.platform_fee_cents;
  new.stripe_payment_intent_id      := old.stripe_payment_intent_id;
  new.picked_up_at                  := old.picked_up_at;
  new.delivered_at                  := old.delivered_at;
  new.cancelled_at                  := old.cancelled_at;
  new.tip_cents                     := old.tip_cents;
  new.tip_payment_intent_id         := old.tip_payment_intent_id;
  new.courier_arrived_at            := old.courier_arrived_at;
  new.sender_liability_accepted_at  := old.sender_liability_accepted_at;
  new.courier_liability_accepted_at := old.courier_liability_accepted_at;

  return new;
end;
$$;
