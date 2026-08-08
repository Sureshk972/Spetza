-- Post-delivery tipping: sender can send a tip to the courier after
-- delivery is complete. Spetza takes 0% of tips.

alter table public.delivery_requests
  add column if not exists tip_cents integer,
  add column if not exists tip_stripe_payment_intent_id text,
  add column if not exists tipped_at timestamptz;
