import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import RatingPrompt from '../../components/RatingPrompt.jsx'
import RatingBadge from '../../components/RatingBadge.jsx'
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh.js'

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
  const { user, profile } = useAuth()
  const [requests, setRequests] = useState([])
  const [ratedIds, setRatedIds] = useState(new Set())
  const [couriers, setCouriers] = useState({})
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(null)

  const refresh = async () => {
    if (!user || !hasSupabaseConfig) {
      setLoading(false)
      return
    }
    const [{ data: reqs }, { data: rats }] = await Promise.all([
      supabase
        .from('delivery_requests')
        .select('*')
        .eq('sender_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('ratings')
        .select('delivery_request_id')
        .eq('rater_id', user.id),
    ])
    const rows = reqs ?? []
    setRequests(rows)
    setRatedIds(new Set((rats ?? []).map((r) => r.delivery_request_id)))

    const courierIds = Array.from(
      new Set(rows.map((r) => r.courier_id).filter(Boolean)),
    )
    if (courierIds.length > 0) {
      const { data: profs } = await supabase
        .from('public_profiles')
        .select('id, first_name, rating_avg, rating_count')
        .in('id', courierIds)
      const map = {}
      for (const p of profs ?? []) map[p.id] = p
      setCouriers(map)
    } else {
      setCouriers({})
    }

    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [user])

  useRealtimeRefresh({
    channelName: user ? `sender-home:${user.id}` : null,
    table: 'delivery_requests',
    filter: user ? `sender_id=eq.${user.id}` : null,
    refresh,
    enabled: !!user,
  })

  const handleCancel = async (request) => {
    const ok = window.confirm(
      `Cancel this delivery? The ${dollars(request.max_price_cents)} hold on your card will be released.`,
    )
    if (!ok) return
    setCancelling(request.id)
    const { error } = await supabase.functions.invoke(
      'cancel-delivery',
      { body: { delivery_request_id: request.id } },
    )
    setCancelling(null)
    if (error) {
      alert(error.message)
      return
    }
    refresh()
  }

  return (
    <div className="min-h-full px-6 py-12 max-w-3xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-signal">Sender</div>
          <h1 className="font-serif text-3xl text-ink mt-1">Your requests</h1>
          <div className="mt-1">
            <RatingBadge avg={profile?.rating_avg} count={profile?.rating_count} />
          </div>
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
              const courier = r.courier_id ? couriers[r.courier_id] : null
              const metaParts = [
                r.package_description,
                r.package_size,
                r.distance_miles != null ? `${r.distance_miles} mi` : null,
              ].filter(Boolean)
              const inner = (
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-xs uppercase tracking-wide text-slate whitespace-nowrap">
                      {r.order_number}
                    </div>
                    <div className="text-xs uppercase tracking-wide text-slate whitespace-nowrap">
                      {timeLabel(r.created_at)}
                    </div>
                  </div>
                  <div className="font-serif text-2xl text-ink">
                    {dollars(r.max_price_cents)}
                  </div>
                  <div className="text-sm text-ink space-y-1">
                    <div>{r.pickup_address}</div>
                    <div className="text-slate/40 text-xs leading-none pl-0.5">↓</div>
                    <div>{r.dropoff_address}</div>
                  </div>
                  {metaParts.length > 0 && (
                    <div className="text-xs text-slate flex flex-wrap gap-x-2 gap-y-1">
                      {metaParts.map((part, i) => (
                        <span key={i} className="flex items-center gap-2">
                          {i > 0 && <span className="text-slate/40">·</span>}
                          <span>{part}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {courier && (
                    <div className="flex items-center gap-2 text-xs text-slate pt-2 border-t border-mist">
                      <span className="text-slate/70">Courier</span>
                      <span className="text-ink">{courier.first_name || 'Assigned'}</span>
                      <span className="text-slate/40">·</span>
                      <RatingBadge avg={courier.rating_avg} count={courier.rating_count} />
                    </div>
                  )}
                  {r.status !== 'open' && (
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-mist">
                      <span className={`inline-block px-2 py-0.5 text-xs rounded-full capitalize ${statusStyles[r.status] ?? 'bg-mist text-slate'}`}>
                        {r.status.replace('_', ' ')}
                      </span>
                      {r.status === 'accepted' && (
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            handleCancel(r)
                          }}
                          disabled={cancelling === r.id}
                          className="text-xs text-slate hover:text-ink transition-colors disabled:opacity-50"
                        >
                          {cancelling === r.id ? 'Cancelling…' : 'Cancel'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
              const canRate = r.status === 'delivered' && r.courier_id && !ratedIds.has(r.id)
              return (
                <li key={r.id}>
                  {editable ? (
                    <Link
                      to={`/sender/requests/${r.id}/edit`}
                      className="block p-5 rounded-xl border border-mist bg-white hover:border-signal transition-colors"
                    >
                      {inner}
                    </Link>
                  ) : canRate ? (
                    <div className="p-5 rounded-xl border border-mist bg-white">
                      {inner}
                      <RatingPrompt
                        request={r}
                        raterId={user.id}
                        rateeId={r.courier_id}
                        rateeLabel="courier"
                        onSubmitted={refresh}
                      />
                      <div className="mt-3 pt-3 border-t border-mist text-right">
                        <Link
                          to={`/sender/requests/${r.id}`}
                          className="text-xs text-slate hover:text-ink"
                        >
                          View details &rarr;
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <Link
                      to={`/sender/requests/${r.id}`}
                      className="block p-5 rounded-xl border border-mist bg-white hover:border-signal transition-colors"
                    >
                      {inner}
                    </Link>
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
