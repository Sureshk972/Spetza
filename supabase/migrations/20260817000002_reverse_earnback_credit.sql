-- Reverse an earnback credit that was recorded but shouldn't have been —
-- specifically when complete-delivery applies the credit, then Stripe
-- capture fails. Without a reversal path, the courier's earnback total
-- would drift ahead of what was actually paid out.
--
-- Mirrors apply_earnback_credit: row-locked, service_role only.

CREATE OR REPLACE FUNCTION public.reverse_earnback_credit(
  p_courier_id uuid,
  p_delivery_id uuid,
  p_credit_cents integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only service_role (edge functions) may call this
  IF current_setting('role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF p_credit_cents <= 0 THEN
    RETURN;
  END IF;

  -- Lock the profile row to serialize with any concurrent apply
  UPDATE profiles
    SET earnback_credited_cents = GREATEST(earnback_credited_cents - p_credit_cents, 0)
    WHERE id = p_courier_id;

  -- Restore the delivery's platform fee and clear the credit record
  UPDATE delivery_requests
    SET platform_fee_cents = platform_fee_cents + p_credit_cents,
        earnback_credit_cents = 0
    WHERE id = p_delivery_id;
END;
$$;
