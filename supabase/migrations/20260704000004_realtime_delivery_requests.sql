-- Enable realtime on delivery_requests so the client can subscribe to
-- INSERT/UPDATE/DELETE via postgres_changes and refetch on events.
-- REPLICA IDENTITY DEFAULT (primary key only) is sufficient — clients
-- refetch instead of consuming the payload directly.

alter publication supabase_realtime add table public.delivery_requests;
