import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function CourierConnectSection({ profile }) {
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState(null)

  if (profile?.stripe_connect_payouts_enabled) {
    return <p className="text-sm text-slate">Bank account connected ✓</p>
  }

  async function connect() {
    setOpening(true)
    setError(null)
    const { data, error: fnErr } = await supabase.functions.invoke(
      'connect-courier',
      { body: { return_url: window.location.origin + '/settings' } },
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
      {error && <p className="text-sm text-signal">{error}</p>}
      <button
        onClick={connect}
        disabled={opening}
        className="bg-ink text-cream px-4 py-2 rounded-lg disabled:opacity-50"
      >
        {opening ? 'Opening Stripe…' : 'Connect bank account'}
      </button>
    </div>
  )
}
