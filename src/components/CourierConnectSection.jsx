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
    return (
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">Bank account connected ✓</p>
        <button
          onClick={manage}
          disabled={opening}
          className="text-xs text-teal hover:underline disabled:opacity-50"
        >
          {opening ? 'Opening…' : 'Manage'}
        </button>
      </div>
    )
  }

  async function manage() {
    setOpening(true)
    setError(null)
    const { data, error: fnErr } = await supabase.functions.invoke(
      'connect-courier',
      { body: { return_url: window.location.origin + '/courier/profile', mode: 'manage' } },
    )
    if (fnErr) {
      setOpening(false)
      setError(fnErr.message)
      return
    }
    window.location.href = data.url
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

  const inProgress = !!profile?.stripe_connect_account_id

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate leading-relaxed">
        {inProgress
          ? "You started setting up payouts but didn't finish. Stripe still needs your bank details so we can pay you after each delivery."
          : "Connect a bank account through Stripe so we can pay you after each delivery. Stripe also handles identity verification."}
      </p>
      {/* Say this before they sign up, not after their first delivery.
          Stripe holds a new connected account's first payout for 7-14 days
          and pays out on a ~2-business-day delay after that. */}
      <div className="p-3 rounded-lg bg-mist border border-mist text-xs text-slate leading-relaxed">
        <span className="text-ink font-medium">When you get paid:</span> earnings land in
        your Stripe balance as soon as a delivery closes. Stripe moves them to your bank
        about 2 business days later. Your very first payout takes longer — up to 14 days —
        while Stripe finishes verifying your account.
      </div>
      {syncing && (
        <p className="text-sm text-slate">Checking your bank connection…</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={connect}
        disabled={opening || syncing}
        className="bg-ink text-white px-4 py-2 rounded-lg disabled:opacity-50 text-sm font-medium"
      >
        {opening
          ? 'Opening Stripe…'
          : inProgress
          ? 'Finish payout setup on Stripe'
          : 'Set up payouts on Stripe'}
      </button>
    </div>
  )
}
