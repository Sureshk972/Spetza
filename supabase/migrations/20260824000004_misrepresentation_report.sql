-- Let a courier report a package that isn't what the sender described.
--
-- The posting flow now warns senders that a dishonest listing can get them
-- suspended. That warning is only worth making if a courier has somewhere to
-- say it happened -- and if the delivery stops rather than recycling to the
-- open list, where the next courier drives out to the same surprise.

create table if not exists public.delivery_reports (
  id uuid primary key default gen_random_uuid(),
  delivery_request_id uuid not null references public.delivery_requests(id) on delete cascade,
  courier_id uuid not null references auth.users(id),
  sender_id uuid not null references auth.users(id),
  reason text not null,
  note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

create index if not exists delivery_reports_unreviewed_idx
  on public.delivery_reports (created_at desc)
  where reviewed_at is null;

alter table public.delivery_reports enable row level security;

-- A courier files a report only against a delivery actually assigned to them.
create policy "courier files own report"
  on public.delivery_reports for insert to authenticated
  with check (
    courier_id = auth.uid()
    and exists (
      select 1 from public.delivery_requests dr
      where dr.id = delivery_request_id
        and dr.courier_id = auth.uid()
    )
  );

-- Couriers see what they filed. Senders deliberately do not: a sender who
-- can read the report can identify the courier who filed it, and the point
-- is to make reporting safe.
create policy "courier reads own reports"
  on public.delivery_reports for select to authenticated
  using (courier_id = auth.uid());

create policy "admins read all reports"
  on public.delivery_reports for select to authenticated
  using (
    coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
  );

create policy "service_role manages reports"
  on public.delivery_reports for all
  to service_role using (true) with check (true);

-- A reported delivery is flagged on the request itself so every listing
-- surface can tell at a glance, without joining the reports table.
alter table public.delivery_requests
  add column if not exists reported_at timestamptz;

comment on column public.delivery_requests.reported_at is
  'Set when a courier reports the package as not matching its description. '
  'The request is cancelled rather than reopened -- see report-delivery.';
