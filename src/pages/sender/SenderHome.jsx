import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import RatingPrompt from '../../components/RatingPrompt.jsx'
import RatingBadge from '../../components/RatingBadge.jsx'
import PackagePhoto from '../../components/PackagePhoto.jsx'
import TipPrompt from '../../components/TipPrompt.jsx'
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh.js'

/* ── How It Works ── */
const STEPS = [
  {
    num: '1',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
    title: 'Post your delivery',
    desc: 'Tap "New request". Enter pickup and drop-off addresses, describe your package, snap a photo, and set your price.',
  },
  {
    num: '2',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    title: 'A courier accepts',
    desc: 'Nearby couriers see your request and accept it. You get a notification the moment someone picks it up.',
  },
  {
    num: '3',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    title: 'Delivered!',
    desc: 'Track the status in your Inbox. Once delivered, you can rate your courier.',
  },
]

function HowItWorks({ variant = 'full' }) {
  if (variant === 'link') {
    const [open, setOpen] = useState(false)
    if (!open) {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate underline underline-offset-4 hover:text-ink transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          How it works
        </button>
      )
    }
    return (
      <div className="mt-4 p-4 rounded-xl border border-teal/20 bg-teal/5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-widest text-teal font-bold">How it works</div>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate hover:text-ink">
            Close
          </button>
        </div>
        <ol className="space-y-3">
          {STEPS.map((s) => (
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

  // Full variant — for empty state
  return (
    <div className="text-center py-10 rounded-2xl border border-dashed border-mist">
      <div className="text-xs uppercase tracking-widest text-teal font-bold mb-6">How it works</div>
      <div className="space-y-6 max-w-sm mx-auto text-left px-6">
        {STEPS.map((s) => (
          <div key={s.num} className="flex gap-4 items-start">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-teal/10 text-teal flex items-center justify-center">
              {s.icon}
            </div>
            <div>
              <div className="font-display text-lg font-extrabold text-ink">{s.title}</div>
              <p className="text-sm text-slate mt-1 leading-relaxed">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <Link
        to="/sender/new"
        className="inline-block mt-8 px-6 py-3 rounded-lg bg-teal text-white font-bold hover:bg-teal/90 transition-colors"
      >
        Send a Package
      </Link>
    </div>
  )
}

const statusStyles = {
  open: 'bg-mist text-slate',
  accepted: 'bg-teal/10 text-teal',
  picked_up: 'bg-teal/10 text-teal',
  delivered: 'bg-green/10 text-green',
  cancelled: 'bg-mist text-slate line-through',
  returned: 'bg-teal/10 text-teal',
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
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [ratedIds, setRatedIds] = useState(new Set())
  const [couriers, setCouriers] = useState({})
  const [pins, setPins] = useState({})
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

    // Fetch pickup PINs for accepted deliveries (sender-only table)
    const acceptedIds = rows.filter((r) => r.status === 'accepted').map((r) => r.id)
    if (acceptedIds.length > 0) {
      const { data: pinRows } = await supabase
        .from('delivery_pins')
        .select('delivery_request_id, pin')
        .in('delivery_request_id', acceptedIds)
      const pinMap = {}
      for (const p of pinRows ?? []) pinMap[p.delivery_request_id] = p.pin
      setPins(pinMap)
    } else {
      setPins({})
    }

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
    // Only 'accepted' requests have an authorized PaymentIntent — 'open'
    // requests were never authorized because no courier has claimed them.
    const msg = request.status === 'accepted'
      ? 'Cancel this delivery? The hold on your card will be released.'
      : 'Cancel this delivery? Your card has not been charged.'
    const ok = window.confirm(msg)
    if (!ok) return
    setCancelling(request.id)
    const { error } = await supabase.functions.invoke(
      'cancel-delivery',
      { body: { delivery_request_id: request.id } },
    )
    setCancelling(null)
    if (error) {
      toast.error(error.message)
      return
    }
    refresh()
  }

  const isEmpty = !loading && requests.length === 0
  const firstName = profile?.first_name

  return (
    <div className="min-h-full px-6 py-12 max-w-3xl mx-auto">
      {isEmpty ? (
        <header>
          <h1 className="font-display text-3xl text-ink">
            {firstName ? `Welcome, ${firstName}` : 'Welcome to Spetza'}
          </h1>
          <p className="text-slate mt-2 text-sm leading-relaxed">
            Send a package across town without leaving home. Post a delivery
            and a nearby courier picks it up.
          </p>
        </header>
      ) : (
        <header>
          <h1 className="font-display text-3xl text-ink">Your deliveries</h1>
          {(profile?.rating_count ?? 0) > 0 && (
            <div className="mt-1">
              <RatingBadge avg={profile?.rating_avg} count={profile?.rating_count} />
            </div>
          )}
          <Link
            to="/sender/new"
            className="mt-5 block w-full py-3 rounded-lg bg-teal text-white text-base font-bold text-center shadow-sm hover:opacity-90 transition-opacity"
          >
            Send a package
          </Link>
        </header>
      )}

      {requests.length > 0 && <HowItWorks variant="link" />}

      <div className="mt-6">
        {loading ? (
          <div className="text-slate">Loading…</div>
        ) : isEmpty ? (
          <HowItWorks variant="full" />
        ) : (
          <ul className="space-y-3">
            {requests.map((r) => {
              const courier = r.courier_id ? couriers[r.courier_id] : null
              const metaParts = [
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
                  <div className="font-display text-2xl text-ink">
                    {dollars(r.max_price_cents)}
                  </div>
                  <div className="divide-y divide-mist">
                    <div className="pb-3">
                      <div className="text-xs uppercase tracking-wide text-slate/70">From</div>
                      <div className="text-sm text-ink mt-1">{r.pickup_address}</div>
                    </div>
                    <div className="py-3">
                      <div className="text-xs uppercase tracking-wide text-slate/70">To</div>
                      <div className="text-sm text-ink mt-1">{r.dropoff_address}</div>
                    </div>
                    {r.package_description && (
                      <div className="py-3">
                        <div className="text-xs uppercase tracking-wide text-slate/70">Description</div>
                        <div className="text-sm text-ink mt-1">{r.package_description}</div>
                      </div>
                    )}
                    <PackagePhoto path={r.package_photo_path} alt={r.package_description || 'Package photo'} />
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
                  {r.status === 'accepted' && pins[r.id] && (
                    <div className={`mt-3 p-3 rounded-lg ${
                      r.courier_arrived_at
                        ? 'bg-green/10 border border-green/30 ring-2 ring-green/30'
                        : 'bg-teal/10 border border-teal/30'
                    }`}>
                      {r.courier_arrived_at && (
                        <div className="text-xs font-bold text-green mb-2">🚗 Courier is here — share your PIN now!</div>
                      )}
                      {!r.courier_arrived_at && (
                        <div className="text-xs font-bold text-teal mb-2">🔑 Courier accepted — your pickup code:</div>
                      )}
                      <div className="text-3xl font-bold tracking-[0.3em] text-ink text-center py-1">
                        {pins[r.id]}
                      </div>
                      <div className="text-xs text-slate text-center mt-1">
                        {r.courier_arrived_at
                          ? 'Tell your courier this code now'
                          : 'Share this code when your courier arrives'}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 pt-3 border-t border-mist">
                    {r.status === 'open' ? (
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          navigate(`/sender/requests/${r.id}/edit`)
                        }}
                        className="px-3 py-1.5 rounded-lg bg-teal text-white text-xs font-medium hover:bg-teal/90 transition-colors"
                      >
                        Edit
                      </button>
                    ) : (
                      <span className={`inline-block px-2 py-0.5 text-xs rounded-full capitalize ${statusStyles[r.status] ?? 'bg-mist text-slate'}`}>
                        {r.status.replace('_', ' ')}
                      </span>
                    )}
                    {(r.status === 'open' || r.status === 'accepted') ? (
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleCancel(r)
                        }}
                        disabled={cancelling === r.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {cancelling === r.id ? 'Cancelling…' : 'Cancel'}
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                </div>
              )
              const canRate = r.status === 'delivered' && r.courier_id && !ratedIds.has(r.id)
              const canTip = r.status === 'delivered' && r.courier_id && !r.tip_cents
                && r.delivered_at && (Date.now() - new Date(r.delivered_at).getTime()) < 48 * 60 * 60 * 1000
              const needsAction = canRate || canTip
              const courierName = courier?.first_name || 'your courier'
              return (
                <li key={r.id}>
                  {needsAction ? (
                    <div className="p-5 rounded-xl border border-mist bg-white">
                      {inner}
                      {canRate && (
                        <RatingPrompt
                          request={r}
                          raterId={user.id}
                          rateeId={r.courier_id}
                          rateeLabel="courier"
                          onSubmitted={refresh}
                        />
                      )}
                      {canTip && (
                        <div className="mt-3 pt-3 border-t border-mist">
                          <TipPrompt
                            request={r}
                            courierName={courierName}
                            onTipped={refresh}
                          />
                        </div>
                      )}
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
                      className="block p-5 rounded-xl border border-mist bg-white hover:border-teal transition-colors"
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
