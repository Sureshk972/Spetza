// Courier taps "I have arrived" at pickup.
//
// The old flow was a raw client-side UPDATE — worked for setting
// courier_arrived_at, but the "Sender has been notified!" toast was a lie
// because no push/SMS/email actually fired. Now we do both:
// 1. Verify the caller IS the assigned courier and status is 'accepted'
// 2. Update courier_arrived_at
// 3. Invoke send-notification with event='arrived' (fires push to sender)
//
// send-notification requires service_role auth (it's an internal fan-out),
// so we can't call it from the client — this wrapper is the bridge.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");

  if (!jwt) return json({ error: "unauthorized" }, 401);

  // 1. Verify caller identity (never trust the client's user_id claim)
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const courierId = userData.user.id;

  const body = await req.json().catch(() => ({}));
  const delivery_request_id: string | undefined = body?.delivery_request_id;
  if (!delivery_request_id) return json({ error: "missing delivery_request_id" }, 400);

  // 2. Update — service role so we bypass RLS + trigger reverts. Guarded
  //    by the WHERE clauses so a non-owner can't set someone else's arrival.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: updated, error: updErr } = await admin
    .from("delivery_requests")
    .update({ courier_arrived_at: new Date().toISOString() })
    .eq("id", delivery_request_id)
    .eq("courier_id", courierId)
    .eq("status", "accepted")
    .select("id")
    .maybeSingle();
  if (updErr) return json({ error: updErr.message }, 500);
  if (!updated) return json({ error: "not found or not owned by you" }, 404);

  // 3. Fire notifications (fire-and-forget — never block on this)
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ delivery_request_id, event: "arrived" }),
    });
  } catch (e) {
    console.error("mark-arrived: send-notification failed", e);
  }

  return json({ ok: true });
});
