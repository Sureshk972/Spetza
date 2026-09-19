-- Couriers are matched to requests by where they are, not where they live.
-- The app writes the phone's position here whenever the courier has it open;
-- push fan-out prefers it while it is fresh and falls back to home otherwise.

alter table public.profiles
  add column if not exists last_lat numeric(9, 6),
  add column if not exists last_lng numeric(9, 6),
  add column if not exists last_located_at timestamptz;

create or replace function public.nearby_couriers_for_push(
  p_pickup_lat numeric,
  p_pickup_lng numeric
)
returns table (id uuid, distance_miles numeric)
language sql stable security definer as $$
  with centred as (
    select
      p.id,
      p.service_radius_miles,
      -- A position from the last four hours is "where they are today".
      case when p.last_located_at > now() - interval '4 hours'
             and p.last_lat is not null and p.last_lng is not null
           then p.last_lat else p.home_lat end as lat,
      case when p.last_located_at > now() - interval '4 hours'
             and p.last_lat is not null and p.last_lng is not null
           then p.last_lng else p.home_lng end as lng
    from public.profiles p
    where p.account_type = 'courier'
      and p.background_check_status = 'clear'
      and p.service_radius_miles is not null
  )
  select
    c.id,
    public.haversine_miles(c.lat, c.lng, p_pickup_lat, p_pickup_lng) as distance_miles
  from centred c
  where c.lat is not null
    and c.lng is not null
    and public.haversine_miles(c.lat, c.lng, p_pickup_lat, p_pickup_lng) <= c.service_radius_miles
  order by distance_miles;
$$;
