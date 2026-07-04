-- Courier verification queue.
--
-- profiles gains: verification_status + audit columns, is_admin flag.
-- verification_documents holds the uploaded ID docs (paths in a private
-- storage bucket). Admins review and approve/reject via a service-role
-- edge function.

create type verification_status_enum as enum ('unverified', 'pending', 'approved', 'rejected');

alter table public.profiles
  add column if not exists verification_status verification_status_enum not null default 'unverified',
  add column if not exists verification_submitted_at timestamptz,
  add column if not exists verification_reviewed_at timestamptz,
  add column if not exists verification_reviewer_id uuid references auth.users(id),
  add column if not exists verification_notes text,
  add column if not exists is_admin boolean not null default false;

create type verification_doc_type as enum ('selfie', 'id_front', 'id_back');

create table if not exists public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid not null references auth.users(id) on delete cascade,
  doc_type verification_doc_type not null,
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  unique (courier_id, doc_type)
);

create index verification_documents_courier_idx
  on public.verification_documents(courier_id);

alter table public.verification_documents enable row level security;

create policy "courier reads own docs" on public.verification_documents
  for select using (auth.uid() = courier_id);

create policy "courier writes own docs" on public.verification_documents
  for insert with check (auth.uid() = courier_id);

create policy "courier updates own docs" on public.verification_documents
  for update using (auth.uid() = courier_id) with check (auth.uid() = courier_id);

create policy "admin reads all docs" on public.verification_documents
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

-- Admins need to see any profile in the queue.
create policy "admin reads all profiles" on public.profiles
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Private bucket for ID documents.
insert into storage.buckets (id, name, public)
values ('courier-verification', 'courier-verification', false)
on conflict (id) do nothing;

create policy "courier uploads own verification docs"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'courier-verification'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "courier updates own verification docs"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'courier-verification'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "courier reads own verification docs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'courier-verification'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "admin reads all verification docs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'courier-verification'
    and exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );
