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
    tone: 'text-signal',
  },
  picked_up: {
    title: 'Picked up',
    tone: 'text-signal',
  },
  delivered: {
    title: 'Delivered',
    tone: 'text-forest',
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
        <div className="flex items-center gap-3 mb-8">
          <p className="text-xs uppercase tracking-widest text-signal">Courier</p>
          <span className="text-slate/40">·</span>
          <h1 className="font-serif text-4xl text-ink">Inbox</h1>
        </div>

        {loading ? (
          <div className="text-slate">Loading…</div>
        ) : events.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-mist">
            <p className="text-slate">Nothing here yet.</p>
            <Link to="/courier" className="inline-block mt-4 text-signal hover:underline">
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
                    className="block p-4 rounded-xl border border-mist bg-white hover:border-signal transition-colors"
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
