-- Add a 4-digit pickup PIN to delivery_requests.
-- Generated when a courier accepts; the sender shares it at handoff.
alter table public.delivery_requests
  add column pickup_pin char(4);
