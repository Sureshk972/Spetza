-- Add Stripe Connect (couriers) + Stripe customer (senders) + payment-method ref.
alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_default_payment_method_id text,
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_charges_enabled boolean not null default false,
  add column if not exists stripe_connect_payouts_enabled boolean not null default false;

-- Payment + fee tracking on a delivery request.
alter table public.delivery_requests
  add column if not exists stripe_payment_intent_id text unique,
  add column if not exists platform_fee_cents integer,
  add column if not exists accepted_price_cents integer;

create index if not exists delivery_requests_pi_idx
  on public.delivery_requests(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
