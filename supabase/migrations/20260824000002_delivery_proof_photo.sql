-- Proof-of-delivery photo. A courier cannot close a delivery without one.
--
-- This is the evidence the liability position rests on: Spetza is a
-- marketplace, not a carrier, and the Terms put loss in transit at the
-- sender's risk. That is only defensible if every completed delivery has a
-- photograph of the drop attached to it, visible to the sender.

alter table public.delivery_requests
  add column if not exists delivery_photo_path text;

comment on column public.delivery_requests.delivery_photo_path is
  'Object path in the delivery-proof bucket. Written by complete-delivery '
  '(service role) after the courier uploads, never by the client directly.';

-- Deliveries already in flight when this shipped have no photo and their
-- couriers were never asked for one. Blocking them would strand someone on
-- a doorstep unable to get paid, so grandfather them explicitly rather than
-- with a date comparison that drifts.
alter table public.delivery_requests
  add column if not exists delivery_photo_required boolean not null default true;

update public.delivery_requests
  set delivery_photo_required = false
  where status in ('accepted', 'picked_up');

comment on column public.delivery_requests.delivery_photo_required is
  'False only for deliveries that were mid-flight when proof-of-delivery '
  'shipped. New rows always require a photo -- do not default this to false.';

-- Private bucket: a drop-off shot is someone's front door, sometimes their
-- face. Unlike package-photos it must never be world-readable.
insert into storage.buckets (id, name, public)
  values ('delivery-proof', 'delivery-proof', false)
  on conflict (id) do nothing;

-- Object paths are `<delivery_request_id>/<uuid>.<ext>`, so the first path
-- segment identifies the delivery and drives every policy below.

drop policy if exists "courier uploads delivery proof" on storage.objects;
create policy "courier uploads delivery proof"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'delivery-proof'
    and exists (
      select 1 from public.delivery_requests dr
      where dr.id::text = (storage.foldername(name))[1]
        and dr.courier_id = auth.uid()
    )
  );

drop policy if exists "delivery parties read proof" on storage.objects;
create policy "delivery parties read proof"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'delivery-proof'
    and exists (
      select 1 from public.delivery_requests dr
      where dr.id::text = (storage.foldername(name))[1]
        and (dr.courier_id = auth.uid() or dr.sender_id = auth.uid())
    )
  );

drop policy if exists "admins read delivery proof" on storage.objects;
create policy "admins read delivery proof"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'delivery-proof'
    and coalesce(
      (select p.is_admin from public.profiles p where p.id = auth.uid()),
      false
    )
  );
