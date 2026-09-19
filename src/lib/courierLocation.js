import { haversineMiles } from './geocode.js'

// A courier's "service area" is centred on wherever they are right now, not
// on their home address. A UPS driver who lives in Indiana and works Chicago
// for the day should see Chicago requests. Home is only the fallback for when
// the phone cannot (or will not) give us a position.

// How long a saved position counts as "where they are" for push fan-out.
export const FRESH_MS = 4 * 60 * 60 * 1000

// Don't write every GPS tick to the database: only when the courier has
// actually moved, or often enough that last_located_at stays fresh.
const SAVE_MIN_MOVE_MILES = 0.5
const SAVE_MAX_AGE_MS = 10 * 60 * 1000

function num(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Pick the centre of the courier's service area.
 * @param {{fix: {lat:number,lng:number}|null, profile: object|null}} args
 * @returns {{lat:number,lng:number,radius:number,source:'gps'|'home'}|null}
 */
export function resolveCenter({ fix, profile }) {
  const radius = num(profile?.service_radius_miles)
  if (radius == null) return null
  if (fix && num(fix.lat) != null && num(fix.lng) != null) {
    return { lat: num(fix.lat), lng: num(fix.lng), radius, source: 'gps' }
  }
  const lat = num(profile?.home_lat)
  const lng = num(profile?.home_lng)
  if (lat == null || lng == null) return null
  return { lat, lng, radius, source: 'home' }
}

/**
 * Should this fix be written to the profile?
 * @param {{lat:number,lng:number,at:number}|null} lastSaved
 * @param {{lat:number,lng:number,at:number}} fix
 * @param {number} now  epoch ms
 */
export function shouldSaveFix(lastSaved, fix, now) {
  if (!lastSaved) return true
  if (now - lastSaved.at >= SAVE_MAX_AGE_MS) return true
  const moved = haversineMiles(lastSaved.lat, lastSaved.lng, fix.lat, fix.lng)
  return moved != null && moved >= SAVE_MIN_MOVE_MILES
}

/** Is a saved last_located_at timestamp recent enough to trust? */
export function isFresh(locatedAt, now = new Date()) {
  if (!locatedAt) return false
  const t = new Date(locatedAt).getTime()
  if (!Number.isFinite(t)) return false
  return now.getTime() - t < FRESH_MS
}

// The "near Chicago, IL" label only needs refreshing once the courier has
// clearly left town, not on every GPS wobble.
const RELABEL_MILES = 2

/** Should we ask the geocoder for a fresh city label for this centre? */
export function needsNewLabel(lastLookedUp, center) {
  if (!center) return false
  if (!lastLookedUp) return true
  const moved = haversineMiles(lastLookedUp.lat, lastLookedUp.lng, center.lat, center.lng)
  return moved == null || moved >= RELABEL_MILES
}
