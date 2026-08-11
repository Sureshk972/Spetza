// Validates the 4-digit pickup PIN entered by the courier, then
// transitions the delivery to "picked_up". Reads PIN from the
// delivery_pins table (not readable by courier via RLS).
// Includes brute-force protection: 5 attempts, then 15-min lockout.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

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

  // Verify the caller is the assigned courier and delivery is in accepted state
  const { data: request, error: reqErr } = await supabase
    .from("delivery_requests")
    .select("id, courier_id, status")
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

  // Read PIN + attempt state from the sender-only table (service_role bypasses RLS)
  const { data: pinRow, error: pinErr } = await supabase
    .from("delivery_pins")
    .select("pin, attempts, locked_until")
    .eq("delivery_request_id", delivery_request_id)
    .single();

  if (pinErr || !pinRow) {
    return json({ error: "no pin on record" }, 404);
  }

  // Check lockout
  if (pinRow.locked_until) {
    const lockExpiry = new Date(pinRow.locked_until);
    if (lockExpiry > new Date()) {
      const minsLeft = Math.ceil((lockExpiry.getTime() - Date.now()) / 60000);
      return json({
        error: `too many attempts — try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}`,
      }, 429);
    }
    // Lockout expired — reset attempts
    await supabase
      .from("delivery_pins")
      .update({ attempts: 0, locked_until: null })
      .eq("delivery_request_id", delivery_request_id);
    pinRow.attempts = 0;
  }

  // Validate the PIN
  const trimmedPin = String(pin).trim();
  if (trimmedPin !== pinRow.pin?.trim()) {
    const newAttempts = (pinRow.attempts ?? 0) + 1;
    const update: Record<string, unknown> = { attempts: newAttempts };
    if (newAttempts >= MAX_ATTEMPTS) {
      update.locked_until = new Date(
        Date.now() + LOCKOUT_MINUTES * 60 * 1000,
      ).toISOString();
    }
    await supabase
      .from("delivery_pins")
      .update(update)
      .eq("delivery_request_id", delivery_request_id);

    const remaining = MAX_ATTEMPTS - newAttempts;
    if (remaining <= 0) {
      return json({
        error: `incorrect pin — locked for ${LOCKOUT_MINUTES} minutes`,
      }, 429);
    }
    return json({
      error: `incorrect pin — ${remaining} attempt${remaining === 1 ? "" : "s"} remaining`,
    }, 422);
  }

  // PIN correct — mark picked up
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

  // Reset attempts on success
  await supabase
    .from("delivery_pins")
    .update({ attempts: 0, locked_until: null })
    .eq("delivery_request_id", delivery_request_id);

  return json({ ok: true });
});
