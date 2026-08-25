-- Let both sides rate a returned delivery.
--
-- The integrity trigger required status = 'delivered', which was the only
-- successful outcome when it was written. A return is now equally finished
-- work: the courier made both trips, the sender got their package back, and
-- money changed hands. Blocking the rating silently denied a courier credit
-- for the case where they did exactly what the sender asked.

create or replace function public.enforce_rating_integrity()
returns trigger language plpgsql security definer as $$
declare
  d record;
begin
  select sender_id, courier_id, status
    into d
    from public.delivery_requests
    where id = new.delivery_request_id;
  if not found then
    raise exception 'delivery not found';
  end if;
  if d.status not in ('delivered', 'returned') then
    raise exception 'can only rate finished deliveries';
  end if;
  if new.rater_id = d.sender_id and new.ratee_id = d.courier_id then
    return new;
  end if;
  if new.rater_id = d.courier_id and new.ratee_id = d.sender_id then
    return new;
  end if;
  raise exception 'rater or ratee not on this delivery';
end $$;
