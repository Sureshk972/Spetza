// Delegates OTP delivery to Twilio Verify. Twilio generates the code,
// sends it over SMS, and owns expiry / attempts / rate-limiting. We
// never see the code, so no local OTP table is needed.
//
// Twilio auth uses a restricted API Key (SK...) scoped to Verify so a
// leak can't be used to send arbitrary SMS or touch the broader account.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_KEY_SID = Deno.env.get("TWILIO_API_KEY_SID")!;
const TWILIO_KEY_SECRET = Deno.env.get("TWILIO_API_KEY_SECRET")!;
const TWILIO_VERIFY_SERVICE_SID = Deno.env.get("TWILIO_VERIFY_SERVICE_SID")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

async function twilioStartVerification(phone: string) {
  const url = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/Verifications`;
  const params = new URLSearchParams({ To: phone, Channel: "sms" });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${TWILIO_KEY_SID}:${TWILIO_KEY_SECRET}`),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

  let phone: string;
  try {
    ({ phone } = await req.json());
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  if (!/^\+[1-9]\d{6,14}$/.test(phone || "")) {
    return json({ ok: false, error: "invalid_phone" });
  }

  const result = await twilioStartVerification(phone);
  if (!result.ok) {
    console.error("twilio verify start failed:", result.status, result.body);
    const twilioCode = (result.body as { code?: number })?.code;
    if (twilioCode === 60212) {
      return json({ ok: false, error: "rate_limited" });
    }
    return json({ ok: false, error: "sms_failed", detail: result.body });
  }

  return json({ ok: true });
});
