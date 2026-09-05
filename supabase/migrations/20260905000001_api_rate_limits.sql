-- Per-user request budgets for edge functions that spend money per call.
--
-- places-autocomplete is auth-gated but otherwise unthrottled: any signed-in
-- account can hold a key down and bill us for Google Places on every keystroke.
-- Auth answers "is this a real user", not "how much may they spend".
--
-- Fixed window, not sliding. A caller can straddle a boundary and get up to
-- 2x the limit across two adjacent windows. That is fine for a spend cap and
-- keeps this to a single round trip with no history table -- the point is to
-- bound the bill, not to police the exact rate.
--
-- The table cannot grow without bound: one row per (user, bucket), reused and
-- reset in place. No cleanup job.

create table if not exists public.api_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null default now(),
  count integer not null default 0,
  primary key (user_id, bucket)
);

alter table public.api_rate_limits enable row level security;

-- No policy for `authenticated` on purpose. Nothing in the client should read
-- or write these; a caller who could edit their own row could lift their own
-- limit. Edge functions reach it with the service role, which bypasses RLS.
create policy "service_role manages rate limits"
  on public.api_rate_limits for all
  to service_role using (true) with check (true);

-- Counts one request against a budget and says whether it is allowed.
--
-- Returns true when the caller is within budget. The increment happens either
-- way, so a caller who keeps hammering stays blocked for the rest of the
-- window rather than being let through the moment it rolls over.
create or replace function public.consume_rate_limit(
  p_user_id uuid,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.api_rate_limits as l (user_id, bucket, window_start, count)
  values (p_user_id, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update
    set
      -- Whether the stored window has aged out decides both columns, so it is
      -- computed the same way in each.
      count = case
        when l.window_start < now() - make_interval(secs => p_window_seconds)
        then 1
        else l.count + 1
      end,
      window_start = case
        when l.window_start < now() - make_interval(secs => p_window_seconds)
        then now()
        else l.window_start
      end
  returning l.count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(uuid, text, integer, integer) from public;
grant execute on function public.consume_rate_limit(uuid, text, integer, integer) to service_role;

comment on table public.api_rate_limits is
  'Per-user request budgets for edge functions that cost money per call. '
  'Written only by the service role -- see _shared/rateLimit.ts.';
