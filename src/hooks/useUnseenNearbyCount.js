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
        .select('id, pickup_lat, pickup_lng')
        .eq('status', 'open')

      const nearby = (data || []).filter((r) => {
        if (r.pickup_lat == null) return false
        const mi = haversineMiles(lat, lng, Number(r.pickup_lat), Number(r.pickup_lng))
        return mi != null && mi <= radius
      }).length

      setCount(nearby)

      if (prevRef.current >= 0 && nearby > prevRef.current) {
        toast('📦 New delivery request nearby!', {
          duration: 8000,
          onDismiss: () => window.location.reload(),
          onAutoClose: () => window.location.reload(),
        })
      }
      prevRef.current = nearby
    }

    poll()
    const id = setInterval(poll, 15_000)
    return () => clearInterval(id)
  }, [ready, lat, lng, radius])

  return count
}
