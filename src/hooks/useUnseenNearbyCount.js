import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
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
  const navigate = useNavigate()
  const location = useLocation()
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

  const prevCountRef = useRef(0)

  useEffect(() => {
    if (!hasSupabaseConfig || !serviceArea) return

    const fetchOpen = async (isRealtime = false) => {
      let query = supabase
        .from('delivery_requests')
        .select('id, pickup_lat, pickup_lng, created_at')
        .eq('status', 'open')

      if (lastSeen) {
        query = query.gt('created_at', lastSeen)
      }

      const { data } = await query
      const newData = data || []
      setRequests(newData)

      // Toast when new orders appear via realtime
      if (isRealtime && newData.length > prevCountRef.current) {
        const nearbyNew = newData.filter((r) => {
          if (r.pickup_lat == null || r.pickup_lng == null) return false
          const miles = haversineMiles(serviceArea.lat, serviceArea.lng, Number(r.pickup_lat), Number(r.pickup_lng))
          return miles != null && miles <= serviceArea.radius
        })
        if (nearbyNew.length > prevCountRef.current) {
          toast('📦 New delivery request nearby!', {
            duration: 5000,
            action: {
              label: 'View',
              onClick: () => {
                if (location.pathname === '/courier') {
                  document.getElementById('open-requests')?.scrollIntoView({ behavior: 'smooth' })
                } else {
                  navigate('/courier')
                  setTimeout(() => {
                    document.getElementById('open-requests')?.scrollIntoView({ behavior: 'smooth' })
                  }, 300)
                }
              },
            },
          })
        }
      }
      prevCountRef.current = newData.length
    }

    fetchOpen(false)

    const channel = supabase
      .channel('unseen-nearby')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'delivery_requests', filter: 'status=eq.open' },
        () => fetchOpen(true),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'delivery_requests' },
        () => fetchOpen(false),
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
