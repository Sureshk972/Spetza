-- Record card disputes and asynchronous payment failures.
--
-- Capture failure at the doorstep is already handled synchronously:
-- complete-delivery returns a 402 and reverses the earnback. What had no path
-- at all is anything Stripe tells us about later -- a chargeback arriving days
-- after a delivery, or a payment that fails outside a request we're serving.
-- Those arrived nowhere: no record, no notification, no way to know it
-- happened short of opening the Stripe dashboard.
--
-- Disputes carry a response deadline. Missing it forfeits the money by
-- default, so the row exists mainly to make sure a human sees one in time.

create table if not exists public.payment_disputes (
  id uuid primary key default gen_random_uuid(),

  -- Stripe's id is the idempotency key: the same dispute is delivered again
  -- on every status change, and re-delivered outright if we return non-2xx.
  stripe_dispute_id text unique not null,
  stripe_charge_id text,
  stripe_payment_intent_id text,

  -- Nullable on purpose. A dispute against a tip, or against a charge whose
  -- metadata we can't resolve, still needs recording -- losing the row
  -- because we couldn't match a delivery would defeat the point.
  delivery_request_id uuid references public.delivery_requests(id) on delete set null,
  sender_id uuid references auth.users(id),
  courier_id uuid references auth.users(id),

  amount_cents integer not null,
  currency text not null default 'usd',
  reason text,
  status text not null,

  -- When Stripe stops accepting evidence. The whole reason for the alert.
  evidence_due_at timestamptz,

  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  outcome text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The admin view wants open disputes first, soonest deadline at the top.
create index if not exists payment_disputes_open_idx
  on public.payment_disputes (evidence_due_at asc nulls last)
  where closed_at is null;

create index if not exists payment_disputes_delivery_idx
  on public.payment_disputes (delivery_request_id);

alter table public.payment_disputes enable row level security;

-- Operator-facing only. A sender who disputed a charge learns nothing from
-- reading our copy of it, and a courier seeing a dispute against a delivery
-- they completed would reasonably read it as an accusation.
create policy "admins read disputes"
  on public.payment_disputes for select to authenticated
  using (
    coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
  );

create policy "service_role manages disputes"
  on public.payment_disputes for all
  to service_role using (true) with check (true);

-- Flagged on the request itself so delivery listings can show it without
-- joining, matching how reported_at works.
alter table public.delivery_requests
  add column if not exists disputed_at timestamptz;

comment on column public.delivery_requests.disputed_at is
  'Set when a card dispute is opened against this delivery''s charge. '
  'Cleared to null if the dispute closes in our favour -- see stripe-payment-webhook.';
