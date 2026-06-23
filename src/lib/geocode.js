import { supabase } from './supabase.js'

export async function geocodeAddress(address) {
  const { data, error } = await supabase.functions.invoke('geocode-address', {
    body: { address },
  })
  if (error) {
    let msg = error?.message || 'Geocoding failed.'
    // supabase-js puts the raw Response on error.context for non-2xx;
    // try to extract our JSON error body.
    try {
      if (error?.context && typeof error.context.json === 'function') {
        const body = await error.context.json()
        if (body?.error) msg = body.error
      }
    } catch {
      // fall through to the generic message
    }
    return { error: msg }
  }
  if (!data || data.error) return { error: data?.error || 'Geocoding failed.' }
  return { lat: data.lat, lng: data.lng, formattedAddress: data.formatted_address }
}

// Great-circle distance in miles between two lat/lng points.
export function haversineMiles(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((n) => !Number.isFinite(n))) return null
  const R = 3958.8
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}
