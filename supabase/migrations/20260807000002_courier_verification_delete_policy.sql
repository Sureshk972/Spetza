-- Allow couriers to delete their own selfie files (needed for
-- replacement uploads and rollback cleanup).
create policy "couriers delete own files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'courier-verification'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
