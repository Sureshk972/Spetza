-- Human-readable order number, e.g. SPZ-00001.
create sequence if not exists public.delivery_request_seq start 1;

alter table public.delivery_requests
  add column if not exists order_number text;

-- Backfill any existing rows that don't have one yet.
update public.delivery_requests
set order_number = 'SPZ-' || lpad(nextval('public.delivery_request_seq')::text, 5, '0')
where order_number is null;

alter table public.delivery_requests
  alter column order_number set default 'SPZ-' || lpad(nextval('public.delivery_request_seq')::text, 5, '0');

alter table public.delivery_requests
  alter column order_number set not null;

alter table public.delivery_requests
  add constraint delivery_requests_order_number_unique unique (order_number);
