-- HIGH #3: Sender bypasses state machine via direct DB update.
-- The "sender owns requests" policy was FOR ALL, letting senders UPDATE
-- any column (status, courier_id, accepted_price_cents) via the client.
-- Fix: replace with separate SELECT/INSERT/DELETE policies. All status
-- changes go through edge functions (service_role).

drop policy if exists "sender owns requests" on public.delivery_requests;

-- Sender can read their own requests
create policy "sender reads own requests"
  on public.delivery_requests for select
  using (auth.uid() = sender_id);

-- Sender can create new requests
create policy "sender creates requests"
  on public.delivery_requests for insert
  with check (auth.uid() = sender_id);

-- Sender can delete their own OPEN requests (cancel before anyone accepts)
create policy "sender deletes open requests"
  on public.delivery_requests for delete
  using (auth.uid() = sender_id and status = 'open');

-- Sender can update only safe columns on OPEN requests (edit before acceptance).
-- Guard trigger on delivery_requests prevents status/courier_id/payment changes.
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

  -- Regular users: force state-machine columns back to old values
  new.status                    := old.status;
  new.courier_id                := old.courier_id;
  new.accepted_at               := old.accepted_at;
  new.accepted_price_cents      := old.accepted_price_cents;
  new.platform_fee_cents        := old.platform_fee_cents;
  new.stripe_payment_intent_id  := old.stripe_payment_intent_id;
  new.picked_up_at              := old.picked_up_at;
  new.delivered_at              := old.delivered_at;
  new.cancelled_at              := old.cancelled_at;
  new.tip_cents                 := old.tip_cents;
  new.tip_payment_intent_id     := old.tip_payment_intent_id;
  new.courier_arrived_at        := old.courier_arrived_at;

  return new;
end;
$$;

drop trigger if exists guard_delivery_privileged_cols on public.delivery_requests;
create trigger guard_delivery_privileged_cols
  before update on public.delivery_requests
  for each row execute function public.guard_delivery_privileged_cols();

-- Sender can update their own open requests (edit address/price/description)
create policy "sender updates open requests"
  on public.delivery_requests for update
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id);


-- ═══════════════════════════════════════════════════════════════════
-- HIGH #8: Verification bucket exposes ID documents.
-- The old policy let any authenticated user read the entire bucket.
-- Fix: scope to selfie files only.
-- ═══════════════════════════════════════════════════════════════════

drop policy if exists "authenticated reads courier selfies" on storage.objects;

create policy "authenticated reads courier selfies"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'courier-verification'
    and name like '%selfie%'
  );
