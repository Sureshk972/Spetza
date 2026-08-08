// Validates the 4-digit pickup PIN entered by the courier, then
// transitions the delivery to "picked_up". Replaces the old client-side
// direct update so the handshake is enforced server-side.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "missing auth" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const token = auth.replace("Bearer ", "");
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser(token);
  if (userErr || !user) return json({ error: "unauthenticated" }, 401);

  const body = await req.json().catch(() => ({}));
  const { delivery_request_id, pin } = body;
  if (!delivery_request_id || !pin) {
    return json({ error: "missing delivery_request_id or pin" }, 400);
  }

  // Fetch the request — service role so we can read pickup_pin
  const { data: request, error: reqErr } = await supabase
    .from("delivery_requests")
    .select("id, courier_id, status, pickup_pin")
    .eq("id", delivery_request_id)
    .single();

  if (reqErr || !request) {
    return json({ error: "request not found" }, 404);
  }
  if (request.courier_id !== user.id) {
    return json({ error: "not your delivery" }, 403);
  }
  if (request.status !== "accepted") {
    return json({ error: "delivery is not in accepted state" }, 409);
  }

  // Validate the PIN
  const trimmedPin = String(pin).trim();
  if (trimmedPin !== request.pickup_pin?.trim()) {
    return json({ error: "incorrect pin" }, 422);
  }

  // Mark picked up
  const { error: updateErr } = await supabase
    .from("delivery_requests")
    .update({
      status: "picked_up",
      picked_up_at: new Date().toISOString(),
    })
    .eq("id", delivery_request_id)
    .eq("courier_id", user.id)
    .eq("status", "accepted");

  if (updateErr) {
    return json({ error: updateErr.message }, 500);
  }

  return json({ ok: true });
});
