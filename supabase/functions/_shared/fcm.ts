// Firebase Cloud Messaging HTTP v1 sender. Uses a Google service account
// (JSON key stored in FCM_SERVICE_ACCOUNT_JSON env var) to mint short-lived
// OAuth2 tokens, then sends push notifications via the FCM v1 REST API.
//
// Fire-and-forget: never throws. Logs failures so a push outage never
// blocks the delivery operation that triggered it.

let cachedToken: { token: string; expiresAt: number } | null = null;

interface ServiceAccountKey {
  project_id: string;
  client_email: string;
  private_key: string;
}

function getServiceAccount(): ServiceAccountKey | null {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.error("FCM: failed to parse FCM_SERVICE_ACCOUNT_JSON");
    return null;
  }
}

// Create a signed JWT for the Google OAuth2 token endpoint.
async function createSignedJwt(sa: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = new TextEncoder();
  const b64url = (data: unknown) =>
    btoa(JSON.stringify(data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const unsigned = `${b64url(header)}.${b64url(payload)}`;

  // Import the PEM private key
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(unsigned));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${unsigned}.${sigB64}`;
}

// Get (or refresh) an OAuth2 access token for FCM.
async function getAccessToken(sa: ServiceAccountKey): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  try {
    const jwt = await createSignedJwt(sa);
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!res.ok) {
      console.error(`FCM: OAuth2 token request failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return cachedToken.token;
  } catch (err) {
    console.error("FCM: failed to get access token:", err);
    return null;
  }
}

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>; // custom key-values (event, deep link, etc.)
}

// Send a push notification to a single FCM token.
// Returns true on success, false on failure (never throws).
async function sendToToken(
  sa: ServiceAccountKey,
  accessToken: string,
  fcmToken: string,
  message: PushMessage,
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            notification: { title: message.title, body: message.body },
            data: message.data ?? {},
            android: { priority: "high" },
            apns: {
              payload: { aps: { sound: "default", badge: 1 } },
            },
          },
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      console.error(`FCM: send failed for token ${fcmToken.slice(0, 12)}…: ${res.status} ${text}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`FCM: send error for token ${fcmToken.slice(0, 12)}…:`, err);
    return false;
  }
}

// Send a push to all registered devices for a list of user IDs.
// Looks up tokens from push_tokens table. Fire-and-forget.
export async function sendPushToUsers(
  supabase: any,
  userIds: string[],
  message: PushMessage,
): Promise<{ sent: number; failed: number }> {
  if (userIds.length === 0) return { sent: 0, failed: 0 };

  const sa = getServiceAccount();
  if (!sa) {
    console.warn("FCM: FCM_SERVICE_ACCOUNT_JSON not set; push not sent");
    return { sent: 0, failed: 0 };
  }

  const accessToken = await getAccessToken(sa);
  if (!accessToken) return { sent: 0, failed: 0 };

  const { data: tokens, error } = await supabase
    .from("push_tokens")
    .select("token")
    .in("user_id", userIds);

  if (error || !tokens || tokens.length === 0) {
    if (error) console.error("FCM: failed to fetch push tokens:", error);
    return { sent: 0, failed: 0 };
  }

  const results = await Promise.allSettled(
    tokens.map((t: { token: string }) => sendToToken(sa, accessToken, t.token, message)),
  );

  let sent = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) sent++;
    else failed++;
  }

  return { sent, failed };
}
