-- Geocoded coordinates for routing & geographic filtering of the courier feed.

alter table public.delivery_requests
  add column if not exists pickup_lat numeric(9, 6),
  add column if not exists pickup_lng numeric(9, 6),
  add column if not exists dropoff_lat numeric(9, 6),
  add column if not exists dropoff_lng numeric(9, 6);

-- Courier service area: a home point + radius they're willing to travel from.
alter table public.profiles
  add column if not exists home_address text,
  add column if not exists home_lat numeric(9, 6),
  add column if not exists home_lng numeric(9, 6),
  add column if not exists service_radius_miles numeric(5, 1);

-- Great-circle distance between two lat/lng pairs in miles.
create or replace function public.haversine_miles(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
) returns numeric
language sql immutable as $$
  select
    3958.8 * 2 * asin(
      sqrt(
        sin(radians(lat2 - lat1) / 2) ^ 2 +
        cos(radians(lat1)) * cos(radians(lat2)) *
        sin(radians(lng2 - lng1) / 2) ^ 2
      )
    );
$$;
