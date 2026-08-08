import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh.js'

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

const EVENT_COPY = {
  accepted: {
    title: 'You accepted a delivery',
    tone: 'text-teal',
  },
  picked_up: {
    title: 'Picked up',
    tone: 'text-teal',
  },
  delivered: {
    title: 'Delivered',
    tone: 'text-green',
  },
  cancelled: {
    title: 'Cancelled',
    tone: 'text-slate',
  },
}

function buildEvents(requests) {
  const events = []
  for (const r of requests) {
    if (r.accepted_at) events.push({ id: `${r.id}:accepted`, kind: 'accepted', time: r.accepted_at, request: r })
    if (r.picked_up_at) events.push({ id: `${r.id}:picked_up`, kind: 'picked_up', time: r.picked_up_at, request: r })
    if (r.delivered_at) events.push({ id: `${r.id}:delivered`, kind: 'delivered', time: r.delivered_at, request: r })
    if (r.cancelled_at) events.push({ id: `${r.id}:cancelled`, kind: 'cancelled', time: r.cancelled_at, request: r })
  }
  return events.sort((a, b) => new Date(b.time) - new Date(a.time))
}

export default function CourierInbox() {
  const { user } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    if (!user || !hasSupabaseConfig) {
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('delivery_requests')
      .select('*')
      .eq('courier_id', user.id)
      .order('accepted_at', { ascending: false })
    setRequests(data || [])
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [user])

  useRealtimeRefresh({
    channelName: user ? `courier_inbox:${user.id}` : null,
    table: 'delivery_requests',
    filter: user ? `courier_id=eq.${user.id}` : null,
    refresh,
    enabled: !!user,
  })

  const events = useMemo(() => buildEvents(requests), [requests])

  return (
    <div className="min-h-full">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-teal">Courier</div>
          <h1 className="font-display text-3xl text-ink mt-1">Inbox</h1>
        </div>

        {loading ? (
          <div className="text-slate">Loading…</div>
        ) : events.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-mist">
            <p className="text-slate">Nothing here yet.</p>
            <Link to="/courier" className="inline-block mt-4 text-teal hover:underline">
              Browse open requests
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {events.map((ev) => {
              const copy = EVENT_COPY[ev.kind]
              return (
                <li key={ev.id}>
                  <Link
                    to={`/courier/deliveries/${ev.request.id}`}
                    className="block p-4 rounded-xl border border-mist bg-white hover:border-teal transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className={`text-sm font-medium ${copy.tone}`}>{copy.title}</div>
                      <div className="text-xs text-slate whitespace-nowrap">{timeLabel(ev.time)}</div>
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-wide text-slate">
                      {ev.request.order_number}
                    </div>
                    <div className="mt-2 text-sm text-slate line-clamp-1">
                      {ev.request.pickup_address} → {ev.request.dropoff_address}
                    </div>
                    {ev.kind === 'accepted' && ev.request.status === 'accepted' && (
                      <div className="mt-3 p-2.5 rounded-lg bg-teal/10 border border-teal/30 flex items-center gap-2">
                        <span className="text-lg">🔑</span>
                        <div>
                          <div className="text-xs font-bold text-teal">Enter PIN to confirm pickup</div>
                          <div className="text-xs text-slate mt-0.5">Ask the sender for their 4-digit code</div>
                        </div>
                      </div>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
