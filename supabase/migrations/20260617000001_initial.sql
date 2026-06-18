-- Spetza initial schema: profiles + delivery_requests

create type spetza_role as enum ('sender', 'courier');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  account_type spetza_role,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type delivery_status as enum ('open', 'accepted', 'picked_up', 'delivered', 'cancelled');

create table public.delivery_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  courier_id uuid references auth.users(id),
  pickup_address text not null,
  dropoff_address text not null,
  package_description text not null,
  max_price_cents integer not null,
  status delivery_status not null default 'open',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz
);
create index delivery_requests_open_idx on public.delivery_requests(status, created_at desc) where status = 'open';
create index delivery_requests_sender_idx on public.delivery_requests(sender_id, created_at desc);
create index delivery_requests_courier_idx on public.delivery_requests(courier_id, created_at desc) where courier_id is not null;

alter table public.profiles enable row level security;
alter table public.delivery_requests enable row level security;

create policy "self read profiles" on public.profiles for select using (auth.uid() = id);
create policy "self upsert profiles" on public.profiles for insert with check (auth.uid() = id);
create policy "self update profiles" on public.profiles for update using (auth.uid() = id);

-- Senders manage their own requests
create policy "sender owns requests" on public.delivery_requests for all
  using (auth.uid() = sender_id) with check (auth.uid() = sender_id);

-- Couriers see open requests (read-only for the list).
create policy "couriers read open requests" on public.delivery_requests for select
  using (
    status = 'open'
    or auth.uid() = courier_id
  );

-- Couriers can update a request to claim or mark progress, but only on
-- 'open' rows or rows they already own.
create policy "couriers update claimable" on public.delivery_requests for update
  using (
    (status = 'open' and courier_id is null)
    or auth.uid() = courier_id
  )
  with check (
    auth.uid() = courier_id
  );
