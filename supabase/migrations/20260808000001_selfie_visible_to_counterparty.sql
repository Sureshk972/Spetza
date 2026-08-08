-- Selfies are meant to be seen by counterparties ("Recipients see this"),
-- so allow any authenticated user to read from the courier-verification bucket.

create policy "authenticated reads courier selfies"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'courier-verification');

-- Expose selfie_path in the public-safe view so counterparties can build
-- a signed URL for the courier's photo.

create or replace view public.public_profiles as
  select
    id,
    first_name,
    rating_avg,
    rating_count,
    selfie_path
  from public.profiles;
