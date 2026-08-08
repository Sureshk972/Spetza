-- Track when courier signals they've arrived at the pickup location.
alter table public.delivery_requests
  add column if not exists courier_arrived_at timestamptz;
