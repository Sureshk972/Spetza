-- Pricing is by distance now, not weight.
alter table public.delivery_requests
  drop column if exists package_weight_lbs;

alter table public.delivery_requests
  add column if not exists distance_miles numeric(6, 2);
