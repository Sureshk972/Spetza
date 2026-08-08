import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { haversineMiles } from '../lib/geocode.js'

const STORAGE_KEY = 'spetza:courier:lastSeenDiscover'
const POLL_INTERVAL_MS = 15_000 // 15-second polling fallback

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
 *
 * Uses polling (every 15 s) as the reliable backbone, plus Supabase
 * realtime as a bonus for near-instant updates when the WebSocket is alive.
 */
export function useUnseenNearbyCount() {
  const { profile } = useAuth()
  const navigateRef = useRef()
  const locationRef = useRef()
  navigateRef.current = useNavigate()
  locationRef.current = useLocation()
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

  // Track previous nearby count to detect new orders (works for both poll and realtime)
  const prevNearbyRef = useRef(0)

  useEffect(() => {
    if (!hasSupabaseConfig || !serviceArea) return

    const filterNearby = (rows) =>
      (rows || []).filter((r) => {
        if (r.pickup_lat == null || r.pickup_lng == null) return false
        const miles = haversineMiles(
          serviceArea.lat, serviceArea.lng,
          Number(r.pickup_lat), Number(r.pickup_lng),
        )
        return miles != null && miles <= serviceArea.radius
      })

    const showToast = () => {
      toast('📦 New delivery request nearby!', {
        duration: 6000,
        action: {
          label: 'View',
          onClick: () => {
            if (locationRef.current.pathname === '/courier') {
              document.getElementById('open-requests')?.scrollIntoView({ behavior: 'smooth' })
            } else {
              navigateRef.current('/courier')
              setTimeout(() => {
                document.getElementById('open-requests')?.scrollIntoView({ behavior: 'smooth' })
              }, 300)
            }
          },
        },
      })
    }

    const fetchAndNotify = async () => {
      let query = supabase
        .from('delivery_requests')
        .select('id, pickup_lat, pickup_lng, created_at')
        .eq('status', 'open')

      if (lastSeen) {
        query = query.gt('created_at', lastSeen)
      }

      const { data } = await query
      const rows = data || []
      setRequests(rows)

      const nearbyCount = filterNearby(rows).length
      if (nearbyCount > prevNearbyRef.current && prevNearbyRef.current >= 0) {
        showToast()
      }
      prevNearbyRef.current = nearbyCount
    }

    // Initial fetch (suppress toast on first load by using -1 sentinel)
    prevNearbyRef.current = -1
    fetchAndNotify().then(() => {
      // After initial fetch completes, allow toast on subsequent fetches
      // (prevNearbyRef is already set to the real count by fetchAndNotify)
    })

    // Polling fallback — reliable on every browser
    const pollTimer = setInterval(fetchAndNotify, POLL_INTERVAL_MS)

    // Realtime bonus — instant when the WebSocket is alive
    const channel = supabase
      .channel('unseen-nearby')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'delivery_requests' },
        () => fetchAndNotify(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'delivery_requests' },
        () => fetchAndNotify(),
      )
      .subscribe()

    return () => {
      clearInterval(pollTimer)
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
