import { useEffect, useMemo, useState } from 'react'
import { supabase, hasSupabaseConfig } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { haversineMiles } from '../lib/geocode.js'

const STORAGE_KEY = 'spetza:courier:lastSeenDiscover'

/** Mark the current time as "seen" — call when the courier visits Discover. */
export function markDiscoverSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString())
  } catch {
    // private browsing
  }
}

/**
 * Returns the number of open delivery requests in the courier's service
 * area that were created after the last time they visited Discover.
 * Subscribes to realtime so the count updates live.
 */
export function useUnseenNearbyCount() {
  const { profile } = useAuth()
  const [requests, setRequests] = useState([])

  const serviceArea =
    profile?.home_lat != null &&
    profile?.home_lng != null &&
    profile?.service_radius_miles != null
      ? {
          lat: Number(profile.home_lat),
          lng: Number(profile.home_lng),
          radius: Number(profile.service_radius_miles),
        }
      : null

  const lastSeen = useMemo(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || null
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    if (!hasSupabaseConfig || !serviceArea) return

    const fetchOpen = async () => {
      let query = supabase
        .from('delivery_requests')
        .select('id, pickup_lat, pickup_lng, created_at')
        .eq('status', 'open')

      if (lastSeen) {
        query = query.gt('created_at', lastSeen)
      }

      const { data } = await query
      setRequests(data || [])
    }

    fetchOpen()

    const channel = supabase
      .channel('unseen-nearby')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_requests', filter: 'status=eq.open' },
        () => fetchOpen(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [serviceArea?.lat, serviceArea?.lng, serviceArea?.radius, lastSeen])

  return useMemo(() => {
    if (!serviceArea) return 0
    return requests.filter((r) => {
      if (r.pickup_lat == null || r.pickup_lng == null) return false
      const miles = haversineMiles(
        serviceArea.lat,
        serviceArea.lng,
        Number(r.pickup_lat),
        Number(r.pickup_lng),
      )
      return miles != null && miles <= serviceArea.radius
    }).length
  }, [requests, serviceArea])
}
