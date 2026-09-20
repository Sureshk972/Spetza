-- Order codes say which way the job runs: SPZD-00021 is a delivery
-- (requester hands over), SPZP-00022 is a pickup (a named contact hands
-- over). A column default can't read `kind`, so the prefix is set by a
-- BEFORE INSERT trigger instead. Same sequence, so numbers stay unique
-- across both kinds.

create or replace function public.set_order_number()
returns trigger
language plpgsql
as $$
begin
  if new.order_number is null then
    new.order_number :=
      case when new.kind = 'pickup' then 'SPZP-' else 'SPZD-' end
      || lpad(nextval('public.delivery_request_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

alter table public.delivery_requests alter column order_number drop default;

drop trigger if exists delivery_requests_order_number on public.delivery_requests;
create trigger delivery_requests_order_number
  before insert on public.delivery_requests
  for each row execute function public.set_order_number();

-- Existing orders keep their number and gain the prefix.
update public.delivery_requests
set order_number = case when kind = 'pickup' then 'SPZP-' else 'SPZD-' end
  || substring(order_number from 5)
where order_number like 'SPZ-%';
