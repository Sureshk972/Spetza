-- Fix remaining critical security findings from code review.

-- ═══════════════════════════════════════════════════════════════════
-- CRITICAL #3: Sender can set arbitrarily low price
-- Fix: enforce a $5.00 minimum at the DB level.
-- ═══════════════════════════════════════════════════════════════════
alter table public.delivery_requests
  add constraint min_price_cents check (max_price_cents >= 500);

-- ═══════════════════════════════════════════════════════════════════
-- CRITICAL #5: Courier can read pickup PIN from DB via RLS SELECT
-- Fix: move PIN to a sender-only table. The courier never sees it;
-- verify-pickup-pin compares server-side via service_role.
-- ═══════════════════════════════════════════════════════════════════
create table if not exists public.delivery_pins (
  delivery_request_id uuid primary key references public.delivery_requests(id) on delete cascade,
  pin char(4) not null,
  attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

alter table public.delivery_pins enable row level security;

-- Only the SENDER of the delivery can read the PIN (to share it at handoff).
create policy "sender reads own pin"
  on public.delivery_pins for select
  using (
    exists (
      select 1 from public.delivery_requests dr
      where dr.id = delivery_request_id
        and dr.sender_id = auth.uid()
    )
  );

-- Only service_role (edge functions) can write pins.
create policy "service_role manages pins"
  on public.delivery_pins for all
  to service_role using (true) with check (true);

-- Migrate any existing PINs from delivery_requests to the new table,
-- then drop the column.
insert into public.delivery_pins (delivery_request_id, pin)
select id, pickup_pin
from public.delivery_requests
where pickup_pin is not null
on conflict (delivery_request_id) do nothing;

alter table public.delivery_requests drop column if exists pickup_pin;
