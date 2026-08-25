import { supabase } from './supabase.js'

/**
 * Mint a session token for one address-entry session.
 *
 * Google bills every keystroke's autocomplete call plus the final details call
 * as a single session when they share a token, so one of these should live for
 * the whole "start typing → pick a suggestion" arc and then be thrown away.
 */
export function newSessionToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `st-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

/** Unwrap the JSON error body supabase-js hides on error.context for non-2xx. */
async function messageFrom(error) {
  let msg = error?.message || 'Places request failed.'
  try {
    if (error?.context && typeof error.context.json === 'function') {
      const body = await error.context.json()
      if (body?.error) msg = body.error
    }
  } catch {
    // fall through to the generic message
  }
  return msg
}

/**
 * Street-address suggestions for a partial input.
 * Returns { suggestions: [{ placeId, mainText, secondaryText }] } or { error }.
 */
export async function fetchSuggestions(input, sessionToken, { signal } = {}) {
  const { data, error } = await supabase.functions.invoke('places-autocomplete', {
    body: { action: 'suggest', input, sessionToken },
    signal,
  })
  if (error) return { error: await messageFrom(error) }
  if (!data || data.error) return { error: data?.error || 'Places request failed.' }
  return { suggestions: data.suggestions || [] }
}

/**
 * Full details for a chosen suggestion: structured parts plus coordinates.
 * Returns { street, city, state, zip, lat, lng, formattedAddress } or { error }.
 */
export async function fetchPlaceDetails(placeId, sessionToken) {
  const { data, error } = await supabase.functions.invoke('places-autocomplete', {
    body: { action: 'details', placeId, sessionToken },
  })
  if (error) return { error: await messageFrom(error) }
  if (!data || data.error) return { error: data?.error || 'Places lookup failed.' }
  return data
}
