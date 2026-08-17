-- Fix bug in guard_delivery_privileged_cols trigger function.
--
-- Two problems in the previous version:
--
-- 1. It referenced new.tip_payment_intent_id / old.tip_payment_intent_id,
--    but the actual column is tip_stripe_payment_intent_id (per
--    20260808000002_tip_support.sql). Every regular-user UPDATE on
--    delivery_requests was throwing:
--      record "new" has no field "tip_payment_intent_id"
--    which blocked the courier from tapping "I've arrived" (which is
--    a client-side update).
--
-- 2. courier_arrived_at was in the revert list, but the client legitimately
--    sets it — handleArrived() in CourierDelivery.jsx does:
--      supabase.from('delivery_requests').update({ courier_arrived_at: ... })
--    With that in the revert list, the update would silently no-op and the
--    sender-side "courier is here" banner would never appear. Removed from
--    the list. RLS + the WHERE courier_id = auth.uid() filter in the
--    handler are sufficient — the worst case is a courier claiming arrival
--    before actually arriving, which triggers only a notification.
--
-- The wrong column name was introduced in 20260810000003 and copied into
-- 20260813000002 and 20260813000003. Fixing here in one place — the latest
-- CREATE OR REPLACE wins.

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

  RETURN new;
END;
$$;
