import { describe, it, expect } from 'vitest'
import { resolveCenter, shouldSaveFix, isFresh, needsNewLabel, placeCourier, FRESH_MS } from './courierLocation.js'

const home = { home_lat: 41.5, home_lng: -87.3, service_radius_miles: 50 } // Indiana
const chicago = { lat: 41.88, lng: -87.63, at: 1_000_000 }

describe('resolveCenter', () => {
  it('uses the live fix when there is one', () => {
    expect(resolveCenter({ fix: chicago, profile: home })).toEqual({
      lat: 41.88, lng: -87.63, radius: 50, source: 'gps',
    })
  })

  it('falls back to home when there is no fix', () => {
    expect(resolveCenter({ fix: null, profile: home })).toEqual({
      lat: 41.5, lng: -87.3, radius: 50, source: 'home',
    })
  })

  it('returns null when there is neither a fix nor a home', () => {
    expect(resolveCenter({ fix: null, profile: { service_radius_miles: 50 } })).toBeNull()
    expect(resolveCenter({ fix: null, profile: null })).toBeNull()
  })

  it('still needs a radius even with a fix', () => {
    expect(resolveCenter({ fix: chicago, profile: { home_lat: 1, home_lng: 2 } })).toBeNull()
  })

  it('coerces numeric strings from the database', () => {
    const p = { home_lat: '41.5', home_lng: '-87.3', service_radius_miles: '50.0' }
    expect(resolveCenter({ fix: null, profile: p })).toEqual({ lat: 41.5, lng: -87.3, radius: 50, source: 'home' })
  })
})

describe('shouldSaveFix', () => {
  const t0 = 1_000_000
  const saved = { lat: 41.88, lng: -87.63, at: t0 }

  it('saves the first fix', () => {
    expect(shouldSaveFix(null, chicago, t0)).toBe(true)
  })

  it('does not save a fix that barely moved within the throttle window', () => {
    const near = { lat: 41.8801, lng: -87.6301, at: t0 + 60_000 }
    expect(shouldSaveFix(saved, near, t0 + 60_000)).toBe(false)
  })

  it('saves when the courier has moved more than half a mile', () => {
    const moved = { lat: 41.90, lng: -87.63, at: t0 + 60_000 } // ~1.4 mi north
    expect(shouldSaveFix(saved, moved, t0 + 60_000)).toBe(true)
  })

  it('saves anyway once the throttle window has passed, so the timestamp stays fresh', () => {
    const same = { lat: 41.88, lng: -87.63, at: t0 + 11 * 60_000 }
    expect(shouldSaveFix(saved, same, t0 + 11 * 60_000)).toBe(true)
  })
})

describe('isFresh', () => {
  it('treats a fix younger than the window as fresh', () => {
    expect(isFresh('2026-09-19T12:00:00Z', new Date('2026-09-19T15:59:00Z'))).toBe(true)
  })
  it('treats a fix older than the window as stale', () => {
    expect(isFresh('2026-09-19T12:00:00Z', new Date('2026-09-19T16:01:00Z'))).toBe(false)
  })
  it('treats a missing timestamp as stale', () => {
    expect(isFresh(null, new Date())).toBe(false)
  })
  it('window is four hours', () => {
    expect(FRESH_MS).toBe(4 * 60 * 60 * 1000)
  })
})

describe('needsNewLabel', () => {
  const looked = { lat: 41.88, lng: -87.63 }

  it('needs a label the first time', () => {
    expect(needsNewLabel(null, looked)).toBe(true)
  })
  it('keeps the label for small moves', () => {
    expect(needsNewLabel(looked, { lat: 41.89, lng: -87.63 })).toBe(false) // ~0.7 mi
  })
  it('re-looks up after moving a couple of miles', () => {
    expect(needsNewLabel(looked, { lat: 41.93, lng: -87.63 })).toBe(true) // ~3.5 mi
  })
  it('never needs a label without a centre', () => {
    expect(needsNewLabel(null, null)).toBe(false)
  })
})

describe('placeCourier', () => {
  const now = new Date('2026-09-19T18:00:00Z')
  const base = { home_lat: '41.5', home_lng: '-87.3' }

  it('draws a live dot at the last position when seen in the last 4 hours', () => {
    const c = { ...base, last_lat: '41.88', last_lng: '-87.63', last_located_at: '2026-09-19T17:30:00Z' }
    expect(placeCourier(c, now)).toMatchObject({ lat: 41.88, lng: -87.63, kind: 'live' })
  })
  it('draws a grey dot at the last position when older than 4 hours', () => {
    const c = { ...base, last_lat: '41.88', last_lng: '-87.63', last_located_at: '2026-09-19T10:00:00Z' }
    expect(placeCourier(c, now)).toMatchObject({ kind: 'stale', lat: 41.88 })
  })
  it('falls back to home when never located', () => {
    expect(placeCourier(base, now)).toMatchObject({ kind: 'home', lat: 41.5, lng: -87.3 })
  })
  it('returns null with no usable position at all', () => {
    expect(placeCourier({}, now)).toBeNull()
  })
})
