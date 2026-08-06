-- Send email notifications on delivery_requests lifecycle events via pg_net -> send-notification edge function

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_delivery_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _event text;
  _url text;
  _service_key text;
  _payload jsonb;
begin
  if tg_op = 'INSERT' then
    _event := 'created';
  elsif tg_op = 'UPDATE' then
    if old.status is not distinct from new.status then
      return new;
    end if;
    _event := new.status::text;
  else
    return new;
  end if;

  if _event not in ('created', 'accepted', 'picked_up', 'delivered', 'cancelled') then
    return new;
  end if;

  -- Primary: app.settings (set on most hosted Supabase projects)
  _url := current_setting('app.settings.supabase_url', true);
  _service_key := current_setting('app.settings.service_role_key', true);

  -- Fallback: vault secrets
  if _url is null or _url = '' or _service_key is null or _service_key = '' then
    begin
      select decrypted_secret into _url
      from vault.decrypted_secrets
      where name = 'supabase_url'
      limit 1;
    exception when others then
      _url := null;
    end;

    begin
      select decrypted_secret into _service_key
      from vault.decrypted_secrets
      where name = 'service_role_key'
      limit 1;
    exception when others then
      _service_key := null;
    end;
  end if;

  if _url is null or _url = '' or _service_key is null or _service_key = '' then
    raise warning 'notify_delivery_status: missing supabase_url or service_role_key setting; skipping notification for delivery_request %', new.id;
    return new;
  end if;

  _payload := jsonb_build_object(
    'delivery_request_id', new.id,
    'event', _event
  );

  perform net.http_post(
    url := rtrim(_url, '/') || '/functions/v1/send-notification',
    body := _payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', concat('Bearer ', _service_key)
    )
  );

  return new;
end;
$$;

drop trigger if exists delivery_requests_notify on public.delivery_requests;
create trigger delivery_requests_notify
  after insert or update on public.delivery_requests
  for each row
  execute function public.notify_delivery_status();
