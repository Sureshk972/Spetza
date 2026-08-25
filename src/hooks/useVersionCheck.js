/* global __BUILD_ID__ */
// Detects that a newer build is live.
//
// Spetza ships no service worker, so a cold launch always fetches the current
// index.html and its hashed bundle. The gap is the long-lived session: a
// standalone home-screen app on iOS can stay backgrounded for days, and a
// courier working a shift may never reload. That session keeps calling edge
// functions that have since changed.

import { useEffect, useState } from 'react'

const CURRENT_BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'

// Foregrounding is the main signal, but a courier can sit on one screen for
// an hour without ever backgrounding the app, so poll as well.
const POLL_MS = 15 * 60 * 1000

async function fetchLatestBuildId() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    return data?.buildId || null
  } catch {
    // Offline or a failed deploy — say nothing rather than nag.
    return null
  }
}

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    // Once it's true it stays true; tearing the listeners down keeps a stale
    // session from polling forever.
    if (updateAvailable) return

    let cancelled = false
    const check = async () => {
      const latest = await fetchLatestBuildId()
      if (cancelled || !latest) return
      if (latest !== CURRENT_BUILD_ID) setUpdateAvailable(true)
    }

    check()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisibility)
    const timer = setInterval(check, POLL_MS)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(timer)
    }
  }, [updateAvailable])

  return updateAvailable
}
