import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'

function dollars(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

export default function CourierHome() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setLoading(false)
      return
    }
    supabase
      .from('delivery_requests')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setRequests(data ?? [])
        setLoading(false)
      })
  }, [])

  const handleAccept = () => {
    alert('Acceptance not yet wired — coming in next phase.')
  }

  return (
    <div className="min-h-full px-6 py-12 max-w-3xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-forest">Courier</div>
          <h1 className="font-serif text-3xl text-ink mt-1">Open requests</h1>
        </div>
        <Link to="/settings" className="text-sm text-slate hover:text-ink">Settings</Link>
      </header>

      <div className="mt-10">
        {loading ? (
          <div className="text-slate">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-mist">
            <p className="text-slate">No open requests right now.</p>
            <p className="text-slate text-sm mt-2">Check back soon.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {requests.map((r) => (
              <li key={r.id} className="p-5 rounded-xl border border-mist bg-white">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm text-slate truncate">
                      <span className="text-ink">{r.pickup_address}</span>
                      <span className="mx-2">→</span>
                      <span className="text-ink">{r.dropoff_address}</span>
                    </div>
                    <div className="text-slate text-sm mt-2 truncate">{r.package_description}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-serif text-xl text-ink">{dollars(r.max_price_cents)}</div>
                    <button
                      onClick={handleAccept}
                      className="mt-2 px-3 py-1 rounded-lg bg-forest text-cream text-xs font-medium hover:opacity-90 transition-opacity"
                    >
                      Accept
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
