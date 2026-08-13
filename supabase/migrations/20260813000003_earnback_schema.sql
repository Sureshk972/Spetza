-- Earn-back tracking: $1 per completed delivery toward $40 background check fee

-- Running total on courier's profile
ALTER TABLE profiles
  ADD COLUMN earnback_credited_cents integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN profiles.earnback_credited_cents
  IS 'Running total of earn-back credits applied ($1/delivery toward $40 bg check fee)';

-- Per-delivery credit record
ALTER TABLE delivery_requests
  ADD COLUMN earnback_credit_cents integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN delivery_requests.earnback_credit_cents
  IS 'Earn-back credit applied on this delivery (deducted from platform fee)';

-- Guard the new column from regular-user tampering
CREATE OR REPLACE FUNCTION public.guard_delivery_privileged_cols()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN new;
  END IF;

  IF coalesce((SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()), false) THEN
    RETURN new;
  END IF;

  -- Regular users: revert all privileged columns
  new.status                        := old.status;
  new.courier_id                    := old.courier_id;
  new.accepted_at                   := old.accepted_at;
  new.accepted_price_cents          := old.accepted_price_cents;
  new.platform_fee_cents            := old.platform_fee_cents;
  new.stripe_payment_intent_id      := old.stripe_payment_intent_id;
  new.picked_up_at                  := old.picked_up_at;
  new.delivered_at                  := old.delivered_at;
  new.cancelled_at                  := old.cancelled_at;
  new.tip_cents                     := old.tip_cents;
  new.tip_payment_intent_id         := old.tip_payment_intent_id;
  new.courier_arrived_at            := old.courier_arrived_at;
  new.sender_liability_accepted_at  := old.sender_liability_accepted_at;
  new.courier_liability_accepted_at := old.courier_liability_accepted_at;
  new.earnback_credit_cents         := old.earnback_credit_cents;

  RETURN new;
END;
$$;

-- Atomic earn-back credit function (called from complete-delivery edge fn)
-- Row-locks the profile to prevent concurrent overcredit.
-- Returns the credit actually applied (0 if already maxed out).
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
  v_applied integer;
BEGIN
  -- Only service_role (edge functions) may call this
  IF current_setting('role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Lock the profile row to prevent concurrent overcredit
  SELECT earnback_credited_cents INTO v_current
    FROM profiles WHERE id = p_courier_id FOR UPDATE;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'courier not found';
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
