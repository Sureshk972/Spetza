-- Fix infinite recursion in profiles RLS.
--
-- The "admin reads all profiles" policy was a SELECT policy on profiles that
-- itself queried profiles to check the is_admin flag. Since Postgres evaluates
-- all permissive policies for the table, that subquery re-triggered the same
-- policy → infinite loop → error 42P17.
--
-- Fix: move the is_admin check into a SECURITY DEFINER function so it bypasses
-- RLS on profiles when reading the flag. Rewrite the admin policies (on
-- profiles, verification_documents, and storage.objects) to call the function
-- instead of an inline subquery.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "admin reads all profiles" on public.profiles;
create policy "admin reads all profiles" on public.profiles
  for select using (public.is_admin());

drop policy if exists "admin reads all docs" on public.verification_documents;
create policy "admin reads all docs" on public.verification_documents
  for select using (public.is_admin());

drop policy if exists "admin reads all verification docs" on storage.objects;
create policy "admin reads all verification docs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'courier-verification'
    and public.is_admin()
  );
