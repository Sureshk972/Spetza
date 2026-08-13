-- Liability acknowledgment timestamps on every delivery
ALTER TABLE delivery_requests
  ADD COLUMN sender_liability_accepted_at timestamptz,
  ADD COLUMN courier_liability_accepted_at timestamptz;

COMMENT ON COLUMN delivery_requests.sender_liability_accepted_at
  IS 'Timestamp when sender acknowledged liability disclaimer before posting';
COMMENT ON COLUMN delivery_requests.courier_liability_accepted_at
  IS 'Timestamp when courier acknowledged liability disclaimer before accepting';
