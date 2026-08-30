# Address Autocomplete — Design

**Date:** 2026-08-25
**Status:** Approved, not yet implemented

## Problem

Posting a delivery requires typing a full street address twice — pickup and dropoff —
across five fields each. On a phone that is the highest-friction moment in the sender
flow, and it is where people abandon. It is also the only place a typo silently costs
money: a mistyped street resolves to the wrong lat/lng, which changes the distance,
which changes the price.

## Current behavior

`StructuredAddressInput` renders five fields (street, apt, city, state, zip),
concatenates them into one string, and calls `onBlur` when the zip field loses focus
and all required parts are filled. `NewRequest` reacts by calling `geocodeAddress()`
→ the `geocode-address` edge function → Google Geocoding API → `{lat, lng,
formatted_address}`. The result populates `pickupGeo` / `dropoffGeo`, which drive the
route map, the distance check against `MAX_DISTANCE_MILES`, and the price.

`GOOGLE_MAPS_API_KEY` lives in Supabase secrets and is never exposed to the browser.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Input shape | Keep all five fields; autocomplete on Street only | Least disruption to a layout that already works. The Apt field has to stay regardless — Google never returns unit numbers. |
| Transport | Proxy through a Supabase edge function | Keeps the API key server-side. A referrer-restricted browser key does not protect the Capacitor native app, whose WebView sends no usable referrer. |
| Scope | Built into the shared component — all five call sites | NewRequest (pickup, dropoff), EditRequest (pickup, dropoff), CourierServiceAreaSection. No extra work, consistent behavior. |
| Geographic scope | Bias toward Chicago, allow anywhere in the US | A hard restriction makes an out-of-box address silently absent with no explanation. `MAX_DISTANCE_MILES` already rejects out-of-range routes with a clear message. |

## Prerequisite (manual)

**Places API (New)** must be enabled in the same Google Cloud project that issued
`GOOGLE_MAPS_API_KEY`. If that key carries API restrictions, Places must be added to
its allowlist. Until then every `suggest` call returns a 403 and the feature degrades
to today's manual typing — which is the designed fallback, so nothing breaks.

## Architecture

### 1. Edge function: `places-autocomplete`

Mirrors `geocode-address`: CORS preflight, requires an `Authorization` header,
verifies the bearer token resolves to a real user before spending any quota, reads
`GOOGLE_MAPS_API_KEY` from the environment.

Two modes on one function, chosen by an `action` field in the body:

**`action: "suggest"`** — body `{ input, sessionToken }`

    POST https://places.googleapis.com/v1/places:autocomplete
    X-Goog-Api-Key: <key>

    {
      "input": "<input>",
      "sessionToken": "<sessionToken>",
      "includedRegionCodes": ["us"],
      "includedPrimaryTypes": ["street_address", "premise", "subpremise"],
      "locationBias": {
        "circle": {
          "center": { "latitude": 41.8781, "longitude": -87.6298 },
          "radius": 50000
        }
      }
    }

Returns a trimmed list: `[{ placeId, mainText, secondaryText }]`. The bias radius is
**50,000m — Google's hard ceiling**, not a chosen number. An earlier draft used 80km
to line up with `MAX_DISTANCE_MILES` (50 mi), and every request 400'd with "Invalid
circle.radius". It falls slightly short of the service area, which costs nothing:
addresses beyond it still resolve, they just aren't ranked first.

`includedPrimaryTypes` is deliberately absent. Region and location bias do the
narrowing; results come back as street addresses without it.

**`action: "details"`** — body `{ placeId, sessionToken }`

    GET https://places.googleapis.com/v1/places/<placeId>
    X-Goog-Api-Key: <key>
    X-Goog-FieldMask: addressComponents,location,formattedAddress

Returns `{ street, city, state, zip, lat, lng, formattedAddress }`, with the street
assembled from the `street_number` and `route` components.

Errors follow the `geocode-address` convention: `{ error: "..." }` with a non-2xx
status, logged server-side.

### 2. Session tokens

The client mints a UUID when a sender begins typing into a street field and passes it
to every `suggest` call and to the final `details` call, then discards it. Google
bills the whole sequence as one autocomplete session rather than one charge per
keystroke. A new token starts on the next fresh edit of that field.

### 3. Client library: `src/lib/places.js`

Mirrors `geocode.js`, including its error-unwrapping (`error.context.json()` for
non-2xx bodies):

- `fetchSuggestions(input, sessionToken, { signal })` → `[{ placeId, mainText, secondaryText }]`
- `fetchPlaceDetails(placeId, sessionToken)` → `{ street, city, state, zip, lat, lng, formattedAddress }`

### 4. `StructuredAddressInput`

The Street input becomes a combobox:

- Fires at 3+ characters, debounced 250ms
- The in-flight request is aborted when a new keystroke arrives
- Dropdown renders below the field: `mainText` bold, `secondaryText` muted
- Arrow Up/Down moves the highlight, Enter selects, Escape closes, blur closes
- Tap selects on mobile
- ARIA combobox roles so the control is reachable without sight or a mouse
- A "Powered by Google" mark sits at the foot of the dropdown, as Google's terms
  require whenever predictions appear outside a Google map

On selection: street, city, state, and zip are filled from the details response. Apt
is left untouched — the sender typed it, and Google does not know it.

A new optional prop `onResolved({ lat, lng, formattedAddress })` fires on selection.

### 5. The geocode call disappears on the happy path

Place Details already returns coordinates, so `onResolved` hands them straight to
`pickupGeo` / `dropoffGeo` with `status: 'ok'`. One round trip instead of two, the map
and price appear immediately, and the "address didn't resolve" failure cannot occur
when a suggestion was picked.

The blur-geocode path stays exactly as it is today, for anyone who types all five
fields by hand and never opens the dropdown.

## Error handling

Autocomplete is an accelerator, never a gate. Nothing it does can stop a sender
posting a delivery.

| Failure | Behavior |
| --- | --- |
| `suggest` fails, times out, or is aborted | Dropdown closes. No toast, no error state. Manual typing and blur-geocode still work. |
| `details` fails after a selection | Fall through to the existing blur-geocode path. |
| Places API not enabled (403) | Same as any `suggest` failure — silent, degrades to today's behavior. |
| No suggestions match | Dropdown closes. The sender keeps typing. |

## Testing

Verified in the browser preview against the running dev server:

1. Type a partial Chicago street into pickup — suggestions appear
2. Pick one — city, state, and zip fill; Apt stays as typed
3. Confirm via the network panel that **no** `geocode-address` call fires
4. Confirm the route map and price render from the Place Details coordinates
5. Type a full address manually without touching the dropdown — blur-geocode still resolves
6. Block the `places-autocomplete` request and confirm the form is still submittable

## Out of scope

- Replacing the five-field layout with a single search box
- Saved or recent addresses
- Autocomplete inside the native app shell beyond what the shared WebView already gives
