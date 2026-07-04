-- Mutual ratings after a delivery is delivered.
--
-- Each side rates the other once per delivery. Aggregate is denormalized
-- onto profiles for cheap reads.

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  delivery_request_id uuid not null references public.delivery_requests(id) on delete cascade,
  rater_id uuid not null references auth.users(id) on delete cascade,
  ratee_id uuid not null references auth.users(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (delivery_request_id, rater_id)
);

create index ratings_ratee_idx on public.ratings(ratee_id, created_at desc);
create index ratings_rater_idx on public.ratings(rater_id, created_at desc);

alter table public.profiles
  add column if not exists rating_avg numeric(3,2),
  add column if not exists rating_count integer not null default 0;

alter table public.ratings enable row level security;

-- Anyone signed in can read ratings (trust signals are public within the app).
create policy "signed in reads ratings" on public.ratings
  for select to authenticated using (true);

-- Only the rater can insert, and only for a delivery they were involved in
-- where the counterparty is the ratee. The trigger below enforces the
-- delivered-status + role check because RLS can't traverse joins cleanly.
create policy "rater inserts own rating" on public.ratings
  for insert to authenticated with check (auth.uid() = rater_id);

-- Enforce that (a) the rater was actually on the delivery, (b) the ratee is
-- the counterparty, and (c) the delivery is delivered. Runs on insert.
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
  if d.status <> 'delivered' then
    raise exception 'can only rate delivered requests';
  end if;
  if new.rater_id = d.sender_id and new.ratee_id = d.courier_id then
    -- sender rates courier
    return new;
  end if;
  if new.rater_id = d.courier_id and new.ratee_id = d.sender_id then
    -- courier rates sender
    return new;
  end if;
  raise exception 'rater or ratee not on this delivery';
end $$;

create trigger ratings_integrity
  before insert on public.ratings
  for each row execute function public.enforce_rating_integrity();

-- Recompute aggregate on the ratee's profile.
create or replace function public.refresh_profile_rating()
returns trigger language plpgsql security definer as $$
begin
  update public.profiles p
    set rating_avg = agg.avg_stars,
        rating_count = agg.n
    from (
      select avg(stars)::numeric(3,2) as avg_stars, count(*) as n
      from public.ratings where ratee_id = new.ratee_id
    ) agg
    where p.id = new.ratee_id;
  return new;
end $$;

create trigger ratings_aggregate
  after insert on public.ratings
  for each row execute function public.refresh_profile_rating();
