import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "missing auth" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const token = auth.replace("Bearer ", "");
  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return json({ error: "unauthenticated" }, 401);

  const { address } = await req.json().catch(() => ({}));
  if (!address || typeof address !== "string" || !address.trim()) {
    return json({ error: "missing address" }, 400);
  }

  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!apiKey) return json({ error: "geocoder not configured (GOOGLE_MAPS_API_KEY missing)" }, 500);

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);

  let resp: Response;
  try {
    resp = await fetch(url);
  } catch (e) {
    console.error("geocode fetch threw", e);
    return json({ error: `geocoder fetch failed: ${(e as Error).message}` }, 502);
  }
  const body = await resp.text();
  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    console.error("non-JSON geocode response", resp.status, body.slice(0, 500));
    return json({ error: `geocoder returned non-JSON (status ${resp.status})` }, 502);
  }
  if (!resp.ok) {
    console.error("geocode http error", resp.status, data);
    return json({ error: `geocoder http ${resp.status}: ${data.error_message || data.status || "unknown"}` }, 502);
  }
  if (data.status === "ZERO_RESULTS") {
    return json({ error: "address not found" }, 404);
  }
  if (data.status !== "OK") {
    console.error("geocode status not OK", data);
    return json({ error: `${data.status}${data.error_message ? ": " + data.error_message : ""}` }, 502);
  }
  if (!data.results?.length) {
    return json({ error: "address not found" }, 404);
  }

  const top = data.results[0];
  return json({
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
    formatted_address: top.formatted_address,
  });
});
