import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'

const statusStyles = {
  open: 'bg-mist text-slate',
  accepted: 'bg-signal/10 text-signal',
  picked_up: 'bg-signal/10 text-signal',
  delivered: 'bg-forest/10 text-forest',
  cancelled: 'bg-mist text-slate line-through',
}

function dollars(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

export default function SenderHome() {
  const { user } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !hasSupabaseConfig) {
      setLoading(false)
      return
    }
    supabase
      .from('delivery_requests')
      .select('*')
      .eq('sender_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setRequests(data ?? [])
        setLoading(false)
      })
  }, [user])

  return (
    <div className="min-h-full px-6 py-12 max-w-3xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-signal">Sender</div>
          <h1 className="font-serif text-3xl text-ink mt-1">Your requests</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/settings" className="text-sm text-slate hover:text-ink">Settings</Link>
          <Link
            to="/sender/new"
            className="px-4 py-2 rounded-lg bg-ink text-cream text-sm font-medium hover:bg-signal transition-colors"
          >
            New request
          </Link>
        </div>
      </header>

      <div className="mt-10">
        {loading ? (
          <div className="text-slate">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-mist">
            <p className="text-slate">No requests yet.</p>
            <Link to="/sender/new" className="inline-block mt-4 text-signal hover:underline">
              Post your first delivery
            </Link>
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
                    <span className={`inline-block mt-2 px-2 py-0.5 text-xs rounded-full ${statusStyles[r.status] ?? 'bg-mist text-slate'}`}>
                      {r.status}
                    </span>
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
