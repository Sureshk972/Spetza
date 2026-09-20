import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { haversineMiles } from '../lib/geocode.js'
import { useCourierPositionContext } from '../context/CourierPositionContext.jsx'
import { resolveCenter } from '../lib/courierLocation.js'

/**
 * Polls for open delivery requests near the courier every 15 s.
 * Shows a toast when a new one appears. Returns the count for the badge.
 */
export function useUnseenNearbyCount() {
  const { profile } = useAuth()
  const [count, setCount] = useState(0)
  const prevRef = useRef(-1) // -1 = first load, suppress toast
  const seenRef = useRef(new Set())

  const { fix } = useCourierPositionContext()
  const center = resolveCenter({ fix, profile })
  const lat = center?.lat
  const lng = center?.lng
  const radius = center?.radius
  const ready = hasSupabaseConfig && center != null

  useEffect(() => {
    if (!ready) return

    const poll = async () => {
      const { data } = await supabase
        .from('delivery_requests')
        .select('id, kind, pickup_lat, pickup_lng')
        .eq('status', 'open')

      const nearbyRows = (data || []).filter((r) => {
        if (r.pickup_lat == null) return false
        const mi = haversineMiles(lat, lng, Number(r.pickup_lat), Number(r.pickup_lng))
        return mi != null && mi <= radius
      })
      const nearby = nearbyRows.length

      setCount(nearby)

      if (prevRef.current >= 0 && nearby > prevRef.current) {
        // Name the kind so a courier knows before opening whether they'll
        // be collecting from a contact or from the requester.
        const fresh = nearbyRows.filter((r) => !seenRef.current.has(r.id))
        const label = fresh.length === 1
          ? (fresh[0].kind === 'pickup' ? 'New pickup request nearby!' : 'New delivery request nearby!')
          : 'New requests nearby!'
        toast(`📦 ${label}`, {
          duration: 8000,
          onDismiss: () => window.location.reload(),
          onAutoClose: () => window.location.reload(),
        })
      }
      prevRef.current = nearby
      seenRef.current = new Set(nearbyRows.map((r) => r.id))
    }

    poll()
    const id = setInterval(poll, 15_000)
    return () => clearInterval(id)
  }, [ready, lat, lng, radius])

  return count
}
