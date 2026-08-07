import { useEffect, useMemo, useState, useCallback } from 'react'
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

const INBOX_STEPS = [
  {
    num: '1',
    title: 'Post a delivery',
    desc: 'Your request goes live and nearby couriers can see it.',
  },
  {
    num: '2',
    title: 'Get notified',
    desc: 'When a courier accepts, picks up, or delivers your package — updates appear here.',
  },
  {
    num: '3',
    title: 'Rate your courier',
    desc: 'After delivery, leave a rating to help the community.',
  },
]

function InboxGuide({ variant = 'full' }) {
  if (variant === 'link') {
    const [open, setOpen] = useState(false)
    if (!open) {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-teal hover:underline"
        >
          How it works
        </button>
      )
    }
    return (
      <div className="mb-6 p-4 rounded-xl border border-teal/20 bg-teal/5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-widest text-teal font-bold">How your inbox works</div>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate hover:text-ink">
            Close
          </button>
        </div>
        <ol className="space-y-3">
          {INBOX_STEPS.map((s) => (
            <li key={s.num} className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal text-white text-xs flex items-center justify-center font-bold">{s.num}</span>
              <div>
                <div className="text-sm font-bold text-ink">{s.title}</div>
                <div className="text-xs text-slate mt-0.5">{s.desc}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  // Full — empty state
  return (
    <div className="text-center py-10 rounded-2xl border border-dashed border-mist">
      <div className="text-xs uppercase tracking-widest text-teal font-bold mb-6">Your inbox</div>
      <div className="space-y-5 max-w-sm mx-auto text-left px-6">
        {INBOX_STEPS.map((s) => (
          <div key={s.num} className="flex gap-3 items-start">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-teal/10 text-teal text-sm flex items-center justify-center font-bold">{s.num}</span>
            <div>
              <div className="font-display text-lg font-extrabold text-ink">{s.title}</div>
              <p className="text-sm text-slate mt-1 leading-relaxed">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-slate text-sm mt-6">Delivery updates will appear here once you post a request.</p>
      <Link
        to="/sender/new"
        className="inline-block mt-4 px-6 py-3 rounded-lg bg-teal text-white font-bold hover:bg-teal/90 transition-colors"
      >
        Post your first delivery
      </Link>
    </div>
  )
}

const EVENT_COPY = {
  accepted: {
    title: 'Courier accepted your request',
    tone: 'text-teal',
  },
  picked_up: {
    title: 'Your package is on the way',
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
  posted: {
    title: 'Request posted',
    tone: 'text-slate',
  },
}

function buildEvents(requests) {
  const events = []
  for (const r of requests) {
    events.push({ id: `${r.id}:posted`, kind: 'posted', time: r.created_at, request: r })
    if (r.accepted_at) events.push({ id: `${r.id}:accepted`, kind: 'accepted', time: r.accepted_at, request: r })
    if (r.picked_up_at) events.push({ id: `${r.id}:picked_up`, kind: 'picked_up', time: r.picked_up_at, request: r })
    if (r.delivered_at) events.push({ id: `${r.id}:delivered`, kind: 'delivered', time: r.delivered_at, request: r })
    if (r.cancelled_at) events.push({ id: `${r.id}:cancelled`, kind: 'cancelled', time: r.cancelled_at, request: r })
  }
  return events.sort((a, b) => new Date(b.time) - new Date(a.time))
}

export default function SenderInbox() {
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
      .eq('sender_id', user.id)
      .order('created_at', { ascending: false })
    setRequests(data || [])
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [user])

  useRealtimeRefresh({
    channelName: user ? `sender_inbox:${user.id}` : null,
    table: 'delivery_requests',
    filter: user ? `sender_id=eq.${user.id}` : null,
    refresh,
    enabled: !!user,
  })

  const events = useMemo(() => buildEvents(requests), [requests])

  return (
    <div className="min-h-full">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-2">
          <p className="text-xs uppercase tracking-widest text-teal">Sender</p>
          <span className="text-slate/40">·</span>
          <h1 className="font-display text-4xl text-ink">Inbox</h1>
        </div>
        {events.length > 0 && (
          <div className="mb-6">
            <InboxGuide variant="link" />
          </div>
        )}

        {loading ? (
          <div className="text-slate">Loading…</div>
        ) : events.length === 0 ? (
          <InboxGuide variant="full" />
        ) : (
          <ul className="space-y-3">
            {events.map((ev) => {
              const copy = EVENT_COPY[ev.kind]
              return (
                <li key={ev.id}>
                  <Link
                    to={`/sender/requests/${ev.request.id}`}
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
