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

// Rank suggestions over roughly the area Spetza serves. This biases ordering
// only — an address outside the circle still shows up if it's what was typed.
//
// 50,000m is Google's hard ceiling for circle.radius, not a chosen number:
// anything larger is rejected with "Invalid circle.radius" and the whole
// request 400s. It falls a little short of MAX_DISTANCE_MILES (50 mi ≈
// 80km), which costs nothing here — a request further out still resolves,
// it just isn't ranked first.
const CHICAGO = { latitude: 41.8781, longitude: -87.6298 };
const BIAS_RADIUS_METERS = 50000;

/** Pull a single component's short or long name out of a Places details response. */
function component(components: any[], type: string, short = false): string {
  const hit = components?.find((c) => c.types?.includes(type));
  if (!hit) return "";
  return (short ? hit.shortText : hit.longText) || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "missing auth" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Verify the caller is a real user before spending any Places quota.
  const token = auth.replace("Bearer ", "");
  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return json({ error: "unauthenticated" }, 401);

  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!apiKey) return json({ error: "places not configured (GOOGLE_MAPS_API_KEY missing)" }, 500);

  const body = await req.json().catch(() => ({}));
  const { action, sessionToken } = body;

  if (action === "suggest") {
    const input = typeof body.input === "string" ? body.input.trim() : "";
    if (input.length < 3) return json({ suggestions: [] });

    let resp: Response;
    try {
      resp = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
        // No includedPrimaryTypes filter. Google classifies most address
        // predictions as `route` or `geocode` rather than `street_address`,
        // so filtering on the address-ish types returned an empty list for
        // real Chicago addresses -- a silent dropdown with no error anywhere.
        // Region and location bias do the narrowing instead.
        body: JSON.stringify({
          input,
          sessionToken,
          includedRegionCodes: ["us"],
          locationBias: { circle: { center: CHICAGO, radius: BIAS_RADIUS_METERS } },
        }),
      });
    } catch (e) {
      console.error("places autocomplete fetch threw", e);
      return json({ error: `places fetch failed: ${(e as Error).message}` }, 502);
    }

    const text = await resp.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      console.error("non-JSON places response", resp.status, text.slice(0, 500));
      return json({ error: `places returned non-JSON (status ${resp.status})` }, 502);
    }
    if (!resp.ok) {
      console.error("places http error", resp.status, data);
      return json(
        { error: `places http ${resp.status}: ${data?.error?.message || "unknown"}` },
        502
      );
    }

    const suggestions = (data.suggestions || [])
      .filter((s: any) => s.placePrediction)
      .map((s: any) => ({
        placeId: s.placePrediction.placeId,
        mainText: s.placePrediction.structuredFormat?.mainText?.text || "",
        secondaryText: s.placePrediction.structuredFormat?.secondaryText?.text || "",
      }))
      .filter((s: any) => s.placeId && s.mainText);

    return json({ suggestions });
  }

  if (action === "details") {
    const placeId = typeof body.placeId === "string" ? body.placeId.trim() : "";
    if (!placeId) return json({ error: "missing placeId" }, 400);

    const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
    if (sessionToken) url.searchParams.set("sessionToken", sessionToken);

    let resp: Response;
    try {
      resp = await fetch(url, {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "addressComponents,location,formattedAddress",
        },
      });
    } catch (e) {
      console.error("places details fetch threw", e);
      return json({ error: `places details fetch failed: ${(e as Error).message}` }, 502);
    }

    const text = await resp.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      console.error("non-JSON places details response", resp.status, text.slice(0, 500));
      return json({ error: `places details returned non-JSON (status ${resp.status})` }, 502);
    }
    if (!resp.ok) {
      console.error("places details http error", resp.status, data);
      return json(
        { error: `places details http ${resp.status}: ${data?.error?.message || "unknown"}` },
        502
      );
    }

    const components = data.addressComponents || [];
    const streetNumber = component(components, "street_number");
    const route = component(components, "route");
    const street = [streetNumber, route].filter(Boolean).join(" ");
    // Google returns the city as "locality" for most addresses, but unincorporated
    // areas fall back to sublocality or the township-level admin area.
    const city =
      component(components, "locality") ||
      component(components, "sublocality") ||
      component(components, "administrative_area_level_3");
    const state = component(components, "administrative_area_level_1", true);
    const zip = component(components, "postal_code");

    return json({
      street,
      city,
      state,
      zip,
      lat: data.location?.latitude ?? null,
      lng: data.location?.longitude ?? null,
      formattedAddress: data.formattedAddress || "",
    });
  }

  return json({ error: "unknown action" }, 400);
});
