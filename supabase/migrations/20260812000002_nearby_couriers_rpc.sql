-- RPC function used by send-notification to find couriers within service
-- radius of a pickup point, for the "new order near you" push fan-out.
-- Returns only verified couriers with complete profiles.

create or replace function public.nearby_couriers_for_push(
  p_pickup_lat numeric,
  p_pickup_lng numeric
)
returns table (id uuid, distance_miles numeric)
language sql stable security definer as $$
  select
    p.id,
    public.haversine_miles(p.home_lat, p.home_lng, p_pickup_lat, p_pickup_lng) as distance_miles
  from public.profiles p
  where p.account_type = 'courier'
    and p.background_check_status = 'clear'
    and p.home_lat is not null
    and p.home_lng is not null
    and p.service_radius_miles is not null
    and public.haversine_miles(p.home_lat, p.home_lng, p_pickup_lat, p_pickup_lng) <= p.service_radius_miles
  order by distance_miles;
$$;
