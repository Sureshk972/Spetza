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

function timeLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
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
            {requests.map((r) => {
              const editable = r.status === 'open'
              const inner = (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-slate">
                      <span>{r.order_number}</span>
                      <span className="text-slate/50">•</span>
                      <span>{timeLabel(r.created_at)}</span>
                    </div>
                    <div className="space-y-0.5 text-sm">
                      <div className="text-slate">
                        <span className="text-slate/70 mr-2">From</span>
                        <span className="text-ink">{r.pickup_address}</span>
                      </div>
                      <div className="text-slate">
                        <span className="text-slate/70 mr-2">To</span>
                        <span className="text-ink">{r.dropoff_address}</span>
                      </div>
                    </div>
                    <div className="text-slate text-sm truncate">{r.package_description}</div>
                    {r.distance_miles != null && (
                      <div className="text-xs text-slate">
                        Distance: <span className="text-ink">{r.distance_miles} mi</span>
                        {r.package_size && <span className="ml-3">Size: <span className="text-ink">{r.package_size}</span></span>}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-serif text-xl text-ink">{dollars(r.max_price_cents)}</div>
                    <span className={`inline-block mt-2 px-2 py-0.5 text-xs rounded-full ${statusStyles[r.status] ?? 'bg-mist text-slate'}`}>
                      {r.status === 'open' ? 'Edit Request' : r.status}
                    </span>
                  </div>
                </div>
              )
              return (
                <li key={r.id}>
                  {editable ? (
                    <Link
                      to={`/sender/requests/${r.id}/edit`}
                      className="block p-5 rounded-xl border border-mist bg-white hover:border-signal transition-colors"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className="p-5 rounded-xl border border-mist bg-white">{inner}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
