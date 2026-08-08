import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import RouteMap from '../../components/RouteMap.jsx'
import RatingPrompt from '../../components/RatingPrompt.jsx'
import RatingBadge from '../../components/RatingBadge.jsx'
import PackagePhoto from '../../components/PackagePhoto.jsx'
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh.js'

const dollars = (cents) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`)

function fmt(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

const statusStyles = {
  open: 'bg-mist text-slate',
  accepted: 'bg-teal/10 text-teal',
  picked_up: 'bg-teal/10 text-teal',
  delivered: 'bg-green/10 text-green',
  cancelled: 'bg-mist text-slate',
}

const statusLabel = {
  open: 'Open',
  accepted: 'Awaiting pickup',
  picked_up: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export default function CourierDelivery() {
  const { id } = useParams()
  const { user } = useAuth()
  const [request, setRequest] = useState(null)
  const [sender, setSender] = useState(null)
  const [rated, setRated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')

  const load = async () => {
    if (!hasSupabaseConfig || !user) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data: req } = await supabase
      .from('delivery_requests')
      .select('*')
      .eq('id', id)
      .eq('courier_id', user.id)
      .maybeSingle()
    setRequest(req ?? null)

    if (req) {
      const { data: prof } = await supabase
        .from('public_profiles')
        .select('id, first_name, rating_avg, rating_count')
        .eq('id', req.sender_id)
        .maybeSingle()
      setSender(prof ?? null)

      const { data: myRating } = await supabase
        .from('ratings')
        .select('id')
        .eq('delivery_request_id', id)
        .eq('rater_id', user.id)
        .maybeSingle()
      setRated(!!myRating)
    } else {
      setSender(null)
      setRated(false)
    }

    setLoading(false)
  }

  useEffect(() => { load() }, [id, user?.id])

  useRealtimeRefresh({
    channelName: id ? `courier-delivery:${id}` : null,
    table: 'delivery_requests',
    filter: id ? `id=eq.${id}` : null,
    refresh: load,
  })

  const handleArrived = async () => {
    setActing(true)
    const { error } = await supabase
      .from('delivery_requests')
      .update({ courier_arrived_at: new Date().toISOString() })
      .eq('id', request.id)
      .eq('courier_id', user.id)
      .eq('status', 'accepted')
    setActing(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Sender has been notified!')
    load()
  }

  const handlePickedUp = async () => {
    const trimmed = pin.trim()
    if (trimmed.length !== 4) {
      setPinError('Enter the 4-digit code from the sender')
      return
    }
    setPinError('')
    setActing(true)
    const { error } = await supabase.functions.invoke('verify-pickup-pin', {
      body: { delivery_request_id: request.id, pin: trimmed },
    })
    setActing(false)
    if (error) {
      setPinError('Incorrect code — ask the sender to check')
      return
    }
    setPin('')
    setPinError('')
    load()
  }

  const handleDelivered = async () => {
    const ok = window.confirm(
      `Confirm delivered? You'll earn ${dollars(courierTake)}.`,
    )
    if (!ok) return
    setActing(true)
    const { error } = await supabase.functions.invoke('complete-delivery', {
      body: { delivery_request_id: request.id },
    })
    setActing(false)
    if (error) {
      toast.error(error.message)
      return
    }
    load()
  }

  const handleAbandon = async () => {
    const ok = window.confirm('Abandon this delivery? It will go back to the open list.')
    if (!ok) return
    setActing(true)
    const { error } = await supabase.functions.invoke('cancel-delivery', {
      body: { delivery_request_id: request.id },
    })
    setActing(false)
    if (error) {
      toast.error(error.message)
      return
    }
    load()
  }

  if (loading) {
    return <div className="min-h-full px-6 py-12 max-w-2xl mx-auto text-slate">Loading…</div>
  }
  if (!request) {
    return (
      <div className="min-h-full px-6 py-12 max-w-2xl mx-auto">
        <Link to="/courier" className="text-sm text-slate hover:text-ink">&larr; back</Link>
        <div className="mt-6 text-slate">Delivery not found.</div>
      </div>
    )
  }

  const courierTake =
    request.accepted_price_cents != null
      ? request.accepted_price_cents - (request.platform_fee_cents ?? 0)
      : request.max_price_cents

  const timeline = [
    { key: 'posted', label: 'Posted', iso: request.created_at, done: true },
    { key: 'accepted', label: 'Accepted', iso: request.accepted_at, done: !!request.accepted_at },
    { key: 'picked_up', label: 'Picked up', iso: request.picked_up_at, done: !!request.picked_up_at },
    { key: 'delivered', label: 'Delivered', iso: request.delivered_at, done: !!request.delivered_at },
  ]
  if (request.status === 'cancelled') {
    timeline.push({ key: 'cancelled', label: 'Cancelled', iso: request.cancelled_at, done: true, error: true })
  }

  return (
    <div className="min-h-full px-6 py-12 max-w-2xl mx-auto">
      <Link to="/courier" className="text-sm text-slate hover:text-ink">&larr; back</Link>

      <div className="mt-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate">{request.order_number}</div>
          <h1 className="font-display text-3xl text-ink mt-1">Delivery</h1>
        </div>
        <span className={`px-2 py-0.5 text-xs rounded-full ${statusStyles[request.status] ?? 'bg-mist text-slate'}`}>
          {statusLabel[request.status] ?? request.status}
        </span>
      </div>

      {request.pickup_lat != null && request.dropoff_lat != null && (
        <div className="mt-6">
          <RouteMap
            pickup={{ lat: request.pickup_lat, lng: request.pickup_lng }}
            dropoff={{ lat: request.dropoff_lat, lng: request.dropoff_lng }}
            height={220}
          />
        </div>
      )}

      <section className="mt-6 grid gap-3">
        <div className="p-4 rounded-xl border border-mist bg-white">
          <div className="text-xs uppercase tracking-widest text-slate">Route</div>
          <div className="mt-2 text-sm space-y-1">
            <div className="text-slate">
              <span className="text-slate/70 mr-2">Pickup</span>
              <span className="text-ink">{request.pickup_address}</span>
            </div>
            <div className="text-slate">
              <span className="text-slate/70 mr-2">Dropoff</span>
              <span className="text-ink">{request.dropoff_address}</span>
            </div>
          </div>
          {request.distance_miles != null && (
            <div className="mt-2 text-xs text-slate">
              Distance: <span className="text-ink">{request.distance_miles} mi</span>
              {request.package_size && (
                <span className="ml-3">Size: <span className="text-ink">{request.package_size}</span></span>
              )}
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl border border-mist bg-white">
          <div className="text-xs uppercase tracking-widest text-slate">Package</div>
          <div className="mt-2 flex items-start gap-3">
            <PackagePhoto path={request.package_photo_path} variant="thumbnail" />
            <div className="text-sm text-slate">{request.package_description}</div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-mist bg-white">
          <div className="text-xs uppercase tracking-widest text-slate">Sender</div>
          {sender ? (
            <div className="mt-2 flex items-center gap-3">
              <div className="text-sm text-ink">{sender.first_name || 'Sender'}</div>
              <RatingBadge avg={sender.rating_avg} count={sender.rating_count} />
            </div>
          ) : (
            <div className="mt-2 text-sm text-slate">—</div>
          )}
        </div>

        <div className="p-4 rounded-xl border border-mist bg-white">
          <div className="text-xs uppercase tracking-widest text-slate">Timeline</div>
          <ol className="mt-3 space-y-2">
            {timeline.map((t) => (
              <li key={t.key} className="flex items-center gap-3 text-sm">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    t.error
                      ? 'bg-red-500'
                      : t.done
                      ? 'bg-green'
                      : 'bg-mist border border-slate/30'
                  }`}
                />
                <span className={t.done ? 'text-ink' : 'text-slate/60'}>{t.label}</span>
                <span className="ml-auto text-xs text-slate">{fmt(t.iso) ?? '—'}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="p-4 rounded-xl border border-mist bg-white space-y-1.5">
          <div className="text-xs uppercase tracking-widest text-slate">Your earnings</div>
          <div className="flex justify-between items-baseline">
            <span className="text-xs uppercase tracking-widest text-ink">You receive</span>
            <span className="font-display text-xl text-ink">{dollars(courierTake)}</span>
          </div>
          <div className="text-xs text-slate pt-1">
            {request.status === 'delivered'
              ? 'Paid out to your Connect account.'
              : request.status === 'cancelled'
              ? 'No payout — the hold was released.'
              : 'Paid when you mark delivered.'}
          </div>
        </div>

        {request.status === 'delivered' && !rated && (
          <div className="p-4 rounded-xl border border-mist bg-white">
            <RatingPrompt
              request={request}
              raterId={user.id}
              rateeId={request.sender_id}
              rateeLabel="sender"
              onSubmitted={load}
            />
          </div>
        )}
      </section>

      {(request.status === 'accepted' || request.status === 'picked_up') && (
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {request.status === 'accepted' && !request.courier_arrived_at && (
            <div className="w-full space-y-3">
              <div className="p-4 rounded-xl border border-teal/30 bg-teal/5">
                <div className="text-xs uppercase tracking-widest text-teal font-bold mb-2">Head to pickup</div>
                <p className="text-sm text-slate mb-2">Go to the pickup address below. Tap "I've arrived" when you're there.</p>
                <div className="mt-2 p-3 rounded-lg bg-white border border-mist">
                  <div className="text-sm text-ink font-medium">{request.pickup_address}</div>
                </div>
                <a
                  href={`https://maps.apple.com/?daddr=${encodeURIComponent(request.pickup_address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm text-teal hover:underline"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="3 11 22 2 13 21 11 13 3 11" />
                  </svg>
                  Open in Maps
                </a>
                <button
                  onClick={handleArrived}
                  disabled={acting}
                  className="mt-4 w-full py-3 rounded-lg bg-teal text-white text-sm font-bold hover:bg-teal/90 disabled:opacity-50 transition-colors"
                >
                  {acting ? 'Notifying sender…' : "I've arrived"}
                </button>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleAbandon}
                  disabled={acting}
                  className="px-3 py-1.5 rounded-lg text-sm text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  Abandon
                </button>
              </div>
            </div>
          )}
          {request.status === 'accepted' && request.courier_arrived_at && (
            <div className="w-full space-y-3">
              <div className="p-4 rounded-xl border border-teal/30 bg-teal/5">
                <div className="text-xs uppercase tracking-widest text-teal font-bold mb-2">Pickup handshake</div>
                <p className="text-sm text-slate mb-1">The sender has been notified you're here.</p>
                <p className="text-sm text-slate mb-3">Ask them for the 4-digit code to confirm pickup.</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setPinError('') }}
                    placeholder="0000"
                    className="w-24 px-3 py-2 rounded-lg bg-white border border-mist text-center text-lg font-bold tracking-[0.3em] focus:border-teal focus:outline-none"
                  />
                  <button
                    onClick={handlePickedUp}
                    disabled={acting || pin.trim().length < 4}
                    className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal/90 disabled:opacity-50 transition-colors"
                  >
                    {acting ? 'Verifying…' : 'Confirm pickup'}
                  </button>
                </div>
                {pinError && <p className="text-sm text-red-500 mt-2">{pinError}</p>}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleAbandon}
                  disabled={acting}
                  className="px-3 py-1.5 rounded-lg text-sm text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  Abandon
                </button>
              </div>
            </div>
          )}
          {request.status === 'picked_up' && (
            <button
              onClick={handleDelivered}
              disabled={acting}
              className="px-4 py-1.5 rounded-lg bg-green text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {acting ? 'Capturing…' : 'Mark delivered'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm text-slate">
      <span>{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  )
}
