// A courier reports that a package isn't what the sender described.
//
// Filing a report ends the delivery rather than returning it to the open
// list: recycling a misrepresented package just sends the next courier to
// the same doorstep. The sender's payment hold is released -- they haven't
// received a service, and charging for a delivery we stopped would be its
// own problem -- and the report lands in admin for a human to judge whether
// the sender belongs on the platform.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const REASONS = new Set([
  "wrong_size",
  "too_heavy",
  "prohibited_item",
  "not_as_described",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "missing auth" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const token = auth.replace("Bearer ", "");
  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return json({ error: "unauthenticated" }, 401);

  const { delivery_request_id, reason, note } = await req.json().catch(() => ({}));
  if (!delivery_request_id) return json({ error: "missing delivery_request_id" }, 400);
  if (!REASONS.has(reason)) return json({ error: "invalid reason" }, 400);

  const { data: request, error: requestErr } = await supabase
    .from("delivery_requests")
    .select("id, sender_id, courier_id, status, stripe_payment_intent_id, reported_at")
    .eq("id", delivery_request_id)
    .single();
  if (requestErr || !request) return json({ error: "request not found" }, 404);
  if (request.courier_id !== user.id) return json({ error: "not your delivery" }, 403);
  if (request.reported_at) return json({ error: "already reported" }, 409);

  // Only before pickup. Once a courier has taken the package the dispute is
  // about something else, and cancelling would leave them holding it.
  if (request.status !== "accepted") {
    return json({ error: `cannot report from status ${request.status}` }, 409);
  }

  // Release the hold first. If the report insert fails afterwards we would
  // rather have an uncharged sender and a missing report than a charged
  // sender for a delivery that never happened.
  if (request.stripe_payment_intent_id) {
    try {
      await stripe.paymentIntents.cancel(
        request.stripe_payment_intent_id,
        { cancellation_reason: "abandoned" },
        { idempotencyKey: `report:${request.stripe_payment_intent_id}` },
      );
    } catch (e: any) {
      if (e?.raw?.code !== "payment_intent_unexpected_state") {
        return json({ error: e?.message || "stripe cancel failed" }, 402);
      }
    }
  }

  const { error: reportErr } = await supabase.from("delivery_reports").insert({
    delivery_request_id,
    courier_id: user.id,
    sender_id: request.sender_id,
    reason,
    note: typeof note === "string" ? note.slice(0, 1000) : null,
  });
  if (reportErr) {
    console.error("report-delivery: failed to file report", reportErr);
    return json({ error: "could not file report" }, 500);
  }

  const { error: updateErr } = await supabase
    .from("delivery_requests")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      reported_at: new Date().toISOString(),
      courier_id: null,
      accepted_at: null,
      accepted_price_cents: null,
      platform_fee_cents: null,
      stripe_payment_intent_id: null,
      courier_arrived_at: null,
    })
    .eq("id", delivery_request_id)
    .eq("status", "accepted");

  if (updateErr) {
    return json({ error: "report filed but request update failed", detail: updateErr.message }, 500);
  }

  await supabase.from("delivery_pins").delete().eq("delivery_request_id", delivery_request_id);

  return json({ ok: true, delivery_request_id });
});
