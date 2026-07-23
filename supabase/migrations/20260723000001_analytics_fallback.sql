-- Fallback store for analytics events that failed to reach Mixpanel from
-- an edge function. safeTrackEvent() (functions/_shared/analytics.ts)
-- writes here on send failure so events aren't lost during a Mixpanel
-- outage. Replay them later with a background job, then delete.

create table if not exists public.analytics_events_fallback (
  id bigserial primary key,
  user_id uuid not null,
  event_name text not null,
  properties jsonb,
  failed_at timestamptz default now(),
  retry_count int default 0,
  last_retry_at timestamptz,
  created_at timestamptz default now()
);

-- Pull the next batch to replay: unsent events, oldest attempt first.
create index if not exists analytics_events_fallback_retry_at
  on public.analytics_events_fallback (last_retry_at asc nulls first)
  where retry_count < 5;

-- service_role only. Edge functions use the service key; no anon/auth
-- client should read or write this table.
alter table public.analytics_events_fallback enable row level security;

create policy "service_role manages fallback events"
  on public.analytics_events_fallback
  for all
  to service_role
  using (true)
  with check (true);
