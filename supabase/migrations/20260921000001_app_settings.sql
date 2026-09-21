-- Operator switches that both the app and the edge functions read, so the
-- client and server can never disagree about a rule. First one: who pays
-- the $40 background check. COURIER_PAYS_BACKGROUND_CHECK as an env var
-- was server-only and the client ignored it; this replaces it.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.app_settings enable row level security;

-- Anyone may read (the welcome page shows the offer before sign-in).
create policy "anyone reads settings"
  on public.app_settings for select
  using (true);

-- Only admins change them.
create policy "admins write settings"
  on public.app_settings for all
  using (coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false))
  with check (coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false));

create policy "service_role manages settings"
  on public.app_settings for all
  to service_role using (true) with check (true);

insert into public.app_settings (key, value)
values ('courier_pays_background_check', 'true'::jsonb)
on conflict (key) do nothing;

comment on table public.app_settings is
  'courier_pays_background_check: true = courier pays $40 via Stripe Checkout '
  'before the check starts and earns it back $1/delivery; false = Spetza '
  'covers the check, no Checkout, no earn-back.';

-- The earn-back credit exists to refund a fee the courier paid. A courier
-- whose check Spetza covered has nothing to earn back, so the credit only
-- applies when a payment is on record.
CREATE OR REPLACE FUNCTION public.apply_earnback_credit(
  p_courier_id uuid,
  p_delivery_id uuid,
  p_credit_cents integer DEFAULT 100,
  p_max_cents integer DEFAULT 4000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current integer;
  v_paid_at timestamptz;
  v_applied integer;
BEGIN
  -- Only service_role (edge functions) may call this
  IF current_setting('role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Lock the profile row to prevent concurrent overcredit
  SELECT earnback_credited_cents, bgcheck_paid_at INTO v_current, v_paid_at
    FROM profiles WHERE id = p_courier_id FOR UPDATE;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'courier not found';
  END IF;

  -- Nothing was paid, so there is nothing to earn back.
  IF v_paid_at IS NULL THEN
    RETURN 0;
  END IF;

  IF v_current >= p_max_cents THEN
    RETURN 0;
  END IF;

  -- Cap so we never exceed the target
  v_applied := LEAST(p_credit_cents, p_max_cents - v_current);

  -- Credit the profile
  UPDATE profiles
    SET earnback_credited_cents = earnback_credited_cents + v_applied
    WHERE id = p_courier_id;

  -- Record credit on the delivery and reduce platform fee
  UPDATE delivery_requests
    SET earnback_credit_cents = v_applied,
        platform_fee_cents = GREATEST(platform_fee_cents - v_applied, 0)
    WHERE id = p_delivery_id;

  RETURN v_applied;
END;
$$;
