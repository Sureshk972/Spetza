-- Photo of the package, uploaded by sender.
alter table public.delivery_requests
  add column if not exists package_photo_path text;

-- Storage bucket for package photos (public so couriers can see).
insert into storage.buckets (id, name, public)
values ('package-photos', 'package-photos', true)
on conflict (id) do nothing;

-- Senders can upload to a folder named with their own user id.
create policy "sender uploads own package photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'package-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Senders can replace/delete their own photos.
create policy "sender modifies own package photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'package-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "sender deletes own package photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'package-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Anyone can read package photos.
create policy "public reads package photos"
  on storage.objects for select
  to public
  using (bucket_id = 'package-photos');
