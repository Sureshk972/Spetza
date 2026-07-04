-- Public-safe projection of profiles: exposes only the trust fields a
-- counterparty needs to see (first name + rating aggregate). The view is
-- owned by the migration runner and does NOT run with security_invoker,
-- so it bypasses base-table RLS — which is why we hand-pick columns.
--
-- Use this whenever one user needs to display another user's identity.

create or replace view public.public_profiles as
  select
    id,
    first_name,
    rating_avg,
    rating_count
  from public.profiles;

grant select on public.public_profiles to authenticated;
