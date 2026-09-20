-- Pickup requests: the requester asks a courier to collect something from a
-- named person or business and bring it to them. The requester is at the
-- dropoff, so the pickup PIN goes to the contact by SMS instead of being
-- shown to the requester, and the courier photographs the item at pickup
-- since the requester never saw it.

create type request_kind as enum ('send', 'pickup');

alter table public.delivery_requests
  add column if not exists kind request_kind not null default 'send',
  add column if not exists pickup_photo_path text;

comment on column public.delivery_requests.kind is
  'send: requester hands the package over at pickup. pickup: a named contact '
  'hands it over and the requester receives it at dropoff.';
comment on column public.delivery_requests.pickup_photo_path is
  'Object path in the delivery-proof bucket, taken by the courier at pickup. '
  'Required before verify-pickup-pin accepts a PIN on a pickup-kind request. '
  'Same <delivery_request_id>/<uuid>.<ext> convention as delivery_photo_path, '
  'so the existing storage policies cover it.';

-- Who hands the package over. Kept off delivery_requests so the courier pool
-- (which can read every open row) never sees a private person's phone.
create table if not exists public.delivery_pickup_contacts (
  delivery_request_id uuid primary key references public.delivery_requests(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  phone text not null check (phone ~ '^\+1[0-9]{10}$'),
  sms_status text not null default 'pending' check (sms_status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default now()
);

alter table public.delivery_pickup_contacts enable row level security;

-- Requester always; courier only once assigned.
create policy "delivery parties read pickup contact"
  on public.delivery_pickup_contacts for select
  using (
    exists (
      select 1 from public.delivery_requests dr
      where dr.id = delivery_request_id
        and (dr.sender_id = auth.uid() or dr.courier_id = auth.uid())
    )
  );

-- Requester writes only while the request is still open.
create policy "sender writes pickup contact while open"
  on public.delivery_pickup_contacts for all
  using (
    exists (
      select 1 from public.delivery_requests dr
      where dr.id = delivery_request_id
        and dr.sender_id = auth.uid()
        and dr.status = 'open'
    )
  )
  with check (
    exists (
      select 1 from public.delivery_requests dr
      where dr.id = delivery_request_id
        and dr.sender_id = auth.uid()
        and dr.status = 'open'
    )
  );

-- send-notification writes sms_status.
create policy "service_role manages pickup contacts"
  on public.delivery_pickup_contacts for all
  to service_role using (true) with check (true);
