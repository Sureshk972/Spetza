import { useEffect, useRef, useState } from 'react'
import { hasSupabaseConfig } from '../lib/supabase.js'
import { reverseGeocodeLabel } from '../lib/geocode.js'
import { needsNewLabel } from '../lib/courierLocation.js'

/**
 * "Chicago, IL" for the courier's current service-area centre.
 * Looks up once, then again only after they've moved a couple of miles.
 */
export function useNearestCity(center) {
  const [label, setLabel] = useState(null)
  const lookedUpRef = useRef(null)
  const lat = center?.lat
  const lng = center?.lng

  useEffect(() => {
    if (!hasSupabaseConfig || lat == null || lng == null) return
    if (!needsNewLabel(lookedUpRef.current, { lat, lng })) return
    lookedUpRef.current = { lat, lng }
    let cancelled = false
    reverseGeocodeLabel(lat, lng).then((l) => { if (!cancelled) setLabel(l) })
    return () => { cancelled = true }
  }, [lat, lng])

  return label
}
