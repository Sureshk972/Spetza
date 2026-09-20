-- RequestDetail subscribes to delivery_pickup_contacts so "Texting Joe…"
-- flips to sent/failed the moment send-notification writes sms_status.
-- Realtime honours the table's select RLS, which already admits the sender.
alter publication supabase_realtime add table public.delivery_pickup_contacts;
