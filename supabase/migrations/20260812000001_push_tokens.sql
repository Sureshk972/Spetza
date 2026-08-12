-- Push notification token storage. Each row is one device registration.
-- A user may have multiple devices; a token is unique across all users.

create table public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token       text not null unique,
  platform    text not null check (platform in ('ios', 'android', 'web')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Index for looking up tokens by user (the hot query path in send-notification)
create index idx_push_tokens_user_id on public.push_tokens(user_id);

-- RLS: users can manage their own tokens only
alter table public.push_tokens enable row level security;

create policy "Users can insert their own tokens"
  on public.push_tokens for insert
  with check (auth.uid() = user_id);

create policy "Users can view their own tokens"
  on public.push_tokens for select
  using (auth.uid() = user_id);

create policy "Users can delete their own tokens"
  on public.push_tokens for delete
  using (auth.uid() = user_id);

create policy "Users can update their own tokens"
  on public.push_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role bypasses RLS, so send-notification (which runs with
-- service_role_key) can read any user's tokens without extra policies.
