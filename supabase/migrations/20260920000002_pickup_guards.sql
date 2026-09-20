-- Pickup-request guards on delivery_requests, folded into the existing
-- privileged-column trigger (body copied from 20260817000001):
--
-- 1. kind is frozen after insert for everyone but the service role. A
--    request that switches send -> pickup mid-flight would skip the
--    contact SMS / photo rule; the reverse would drop the contact row's
--    purpose.
-- 2. pickup_photo_path is written only by the assigned courier. The photo
--    is the courier's proof of what they collected; the requester (or a
--    stale ex-courier) must not be able to set or clear it.

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
  new.status                          := old.status;
  new.courier_id                      := old.courier_id;
  new.accepted_at                     := old.accepted_at;
  new.accepted_price_cents            := old.accepted_price_cents;
  new.platform_fee_cents              := old.platform_fee_cents;
  new.stripe_payment_intent_id        := old.stripe_payment_intent_id;
  new.picked_up_at                    := old.picked_up_at;
  new.delivered_at                    := old.delivered_at;
  new.cancelled_at                    := old.cancelled_at;
  new.tip_cents                       := old.tip_cents;
  new.tip_stripe_payment_intent_id    := old.tip_stripe_payment_intent_id;
  new.tipped_at                       := old.tipped_at;
  new.sender_liability_accepted_at    := old.sender_liability_accepted_at;
  new.courier_liability_accepted_at   := old.courier_liability_accepted_at;
  new.earnback_credit_cents           := old.earnback_credit_cents;

  -- Pickup requests: kind never changes after insert, and only the
  -- assigned courier writes the pickup photo path.
  new.kind                            := old.kind;
  IF auth.uid() IS DISTINCT FROM old.courier_id THEN
    new.pickup_photo_path             := old.pickup_photo_path;
  END IF;

  RETURN new;
END;
$$;
