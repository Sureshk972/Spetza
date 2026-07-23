// Server-side Mixpanel tracking for edge functions. Uses Mixpanel's
// HTTP ingestion API directly (no SDK — keeps the Deno bundle small and
// avoids esm.sh compatibility surprises). On any send failure it writes
// the event to the analytics_events_fallback table so a Mixpanel outage
// never blocks the delivery operation that called it.

const MIXPANEL_TOKEN = Deno.env.get("MIXPANEL_TOKEN");

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export async function safeTrackEvent(
  supabase: SupabaseClient,
  userId: string,
  eventName: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  if (!MIXPANEL_TOKEN) {
    console.warn(`MIXPANEL_TOKEN not set; ${eventName} not tracked`);
    return;
  }

  const payload = [{
    event: eventName,
    properties: {
      token: MIXPANEL_TOKEN,
      distinct_id: userId,
      time: Math.floor(Date.now() / 1000),
      ...properties,
    },
  }];

  try {
    const res = await fetch("https://api.mixpanel.com/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/plain",
      },
      body: "data=" + encodeURIComponent(JSON.stringify(payload)),
    });
    const text = await res.text();
    // Mixpanel's /track returns "1" on success, "0" on failure.
    if (!res.ok || text.trim() === "0") {
      throw new Error(`Mixpanel responded ${res.status}: ${text}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to track ${eventName}; saving to fallback:`, message);
    try {
      await supabase.from("analytics_events_fallback").insert({
        user_id: userId,
        event_name: eventName,
        properties,
      });
    } catch (fallbackErr) {
      const fbMessage = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      console.error("Failed to save to fallback table:", fbMessage);
    }
  }
}
