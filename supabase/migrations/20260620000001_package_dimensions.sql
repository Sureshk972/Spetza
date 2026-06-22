alter table public.delivery_requests
  add column if not exists package_weight_lbs numeric(6, 2),
  add column if not exists package_size text;
