import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function CourierConnectSection({ profile }) {
  const { refreshProfile } = useAuth()
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const syncedForAccountRef = useRef(null)

  // When we have a Stripe account but the flags say we're not payouts-ready,
  // pull fresh state from Stripe once per account and update the profile.
  // Guards a per-account ref so we don't spam Stripe on every re-render.
  useEffect(() => {
    const acctId = profile?.stripe_connect_account_id
    if (!acctId) return
    if (profile?.stripe_connect_payouts_enabled) return
    if (syncedForAccountRef.current === acctId) return
    syncedForAccountRef.current = acctId

    let cancelled = false
    ;(async () => {
      setSyncing(true)
      const { data, error: fnErr } = await supabase.functions.invoke('refresh-connect-status')
      if (cancelled) return
      setSyncing(false)
      if (fnErr) return // silent — the manual Connect button still works
      if (data?.synced && (data.charges_enabled || data.payouts_enabled)) {
        await refreshProfile()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profile?.stripe_connect_account_id, profile?.stripe_connect_payouts_enabled, refreshProfile])

  if (profile?.stripe_connect_payouts_enabled) {
    return <p className="text-sm text-slate">Bank account connected ✓</p>
  }

  async function connect() {
    setOpening(true)
    setError(null)
    const { data, error: fnErr } = await supabase.functions.invoke(
      'connect-courier',
      { body: { return_url: window.location.origin + '/courier/profile' } },
    )
    if (fnErr) {
      setOpening(false)
      setError(fnErr.message)
      return
    }
    window.location.href = data.url
  }

  return (
    <div className="space-y-2">
      {syncing && (
        <p className="text-sm text-slate">Checking your bank connection…</p>
      )}
      {error && <p className="text-sm text-signal">{error}</p>}
      <button
        onClick={connect}
        disabled={opening || syncing}
        className="bg-ink text-cream px-4 py-2 rounded-lg disabled:opacity-50"
      >
        {opening ? 'Opening Stripe…' : profile?.stripe_connect_account_id ? 'Resume onboarding' : 'Connect bank account'}
      </button>
    </div>
  )
}
