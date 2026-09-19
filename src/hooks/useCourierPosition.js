import { useEffect, useRef, useState } from 'react'
import { Geolocation } from '@capacitor/geolocation'
import { supabase, hasSupabaseConfig } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { isNative } from '../lib/capacitor.js'
import { shouldSaveFix } from '../lib/courierLocation.js'

// Re-read the phone's position this often while the courier has the app open.
const WATCH_MAX_AGE_MS = 60 * 1000

/**
 * Where the courier is right now.
 *
 * Asks the OS once (the standard "Allow Spetza to use your location?" prompt),
 * then follows the phone's position while the app is open and records it on
 * the profile so push fan-out can find couriers by where they are today.
 *
 * Returns { fix, status } where fix is { lat, lng, at } or null and status is
 * 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable'. Callers should
 * fall back to home when fix is null (see resolveCenter).
 */
export function useCourierPosition({ enabled = true } = {}) {
  const { user, profile } = useAuth()
  const [fix, setFix] = useState(null)
  const [status, setStatus] = useState('idle')
  const lastSavedRef = useRef(null)

  const isCourier = profile?.account_type === 'courier'

  useEffect(() => {
    if (!enabled || !isCourier) return
    let cancelled = false
    let watchId = null

    const persist = async (next) => {
      if (!hasSupabaseConfig || !user) return
      const now = Date.now()
      if (!shouldSaveFix(lastSavedRef.current, next, now)) return
      lastSavedRef.current = { ...next, at: now }
      const { error } = await supabase
        .from('profiles')
        .update({
          last_lat: next.lat,
          last_lng: next.lng,
          last_located_at: new Date(now).toISOString(),
        })
        .eq('id', user.id)
      if (error) console.warn('useCourierPosition: could not save position', error.message)
    }

    const onPosition = (pos) => {
      if (cancelled || !pos?.coords) return
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude, at: Date.now() }
      setFix(next)
      setStatus('granted')
      persist(next)
    }

    const onError = (err) => {
      if (cancelled) return
      const msg = String(err?.message || err || '').toLowerCase()
      const denied = err?.code === 1 || msg.includes('denied') || msg.includes('permission')
      setStatus(denied ? 'denied' : 'unavailable')
    }

    const start = async () => {
      setStatus('locating')
      try {
        if (isNative()) {
          const perm = await Geolocation.requestPermissions()
          if (perm.location === 'denied') { setStatus('denied'); return }
          const pos = await Geolocation.getCurrentPosition({ maximumAge: WATCH_MAX_AGE_MS })
          onPosition(pos)
          watchId = await Geolocation.watchPosition(
            { maximumAge: WATCH_MAX_AGE_MS },
            (pos, err) => (err ? onError(err) : onPosition(pos)),
          )
        } else if (typeof navigator !== 'undefined' && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(onPosition, onError, { maximumAge: WATCH_MAX_AGE_MS })
          watchId = navigator.geolocation.watchPosition(onPosition, onError, { maximumAge: WATCH_MAX_AGE_MS })
        } else {
          setStatus('unavailable')
        }
      } catch (e) {
        onError(e)
      }
    }

    start()

    return () => {
      cancelled = true
      if (watchId == null) return
      if (isNative()) Geolocation.clearWatch({ id: watchId }).catch(() => {})
      else navigator.geolocation?.clearWatch(watchId)
    }
  }, [enabled, isCourier, user?.id])

  return { fix, status }
}
