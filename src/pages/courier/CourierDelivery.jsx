import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import RouteMap from '../../components/RouteMap.jsx'
import RatingPrompt from '../../components/RatingPrompt.jsx'
import RatingBadge from '../../components/RatingBadge.jsx'

const dollars = (cents) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`)

function fmt(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

const statusStyles = {
  open: 'bg-mist text-slate',
  accepted: 'bg-signal/10 text-signal',
  picked_up: 'bg-signal/10 text-signal',
  delivered: 'bg-forest/10 text-forest',
  cancelled: 'bg-mist text-slate',
}

const statusLabel = {
  open: 'Open',
  accepted: 'Awaiting pickup',
  picked_up: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

function photoUrl(path) {
  if (!path) return null
  const { data } = supabase.storage.from('package-photos').getPublicUrl(path)
  return data.publicUrl
}

export default function CourierDelivery() {
  const { id } = useParams()
  const { user } = useAuth()
  const [request, setRequest] = useState(null)
  const [sender, setSender] = useState(null)
  const [rated, setRated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

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

  const handlePickedUp = async () => {
    setActing(true)
    const { error } = await supabase
      .from('delivery_requests')
      .update({ status: 'picked_up', picked_up_at: new Date().toISOString() })
      .eq('id', request.id)
      .eq('courier_id', user.id)
      .eq('status', 'accepted')
    setActing(false)
    if (error) {
      toast.error(error.message)
      return
    }
    load()
  }

  const handleDelivered = async () => {
    const ok = window.confirm(
      `Confirm delivered? The sender will be charged ${dollars(request.max_price_cents)}.`,
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

  const photo = photoUrl(request.package_photo_path)

  return (
    <div className="min-h-full px-6 py-12 max-w-2xl mx-auto">
      <Link to="/courier" className="text-sm text-slate hover:text-ink">&larr; back</Link>

      <div className="mt-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate">{request.order_number}</div>
          <h1 className="font-serif text-3xl text-ink mt-1">Delivery</h1>
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
            {photo && (
              <img
                src={photo}
                alt="Package"
                className="w-20 h-20 object-cover rounded-lg border border-mist shrink-0"
              />
            )}
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
                      ? 'bg-forest'
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
          <div className="text-xs uppercase tracking-widest text-slate">Your take</div>
          <Row label="Delivery" value={dollars(request.accepted_price_cents ?? request.max_price_cents)} />
          <Row label="Platform fee" value={`-${dollars(request.platform_fee_cents ?? 0)}`} />
          <div className="border-t border-slate/20 pt-1.5 flex justify-between items-baseline">
            <span className="text-xs uppercase tracking-widest text-ink">You receive</span>
            <span className="font-serif text-xl text-ink">{dollars(courierTake)}</span>
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
          {request.status === 'accepted' && (
            <>
              <button
                onClick={handleAbandon}
                disabled={acting}
                className="px-3 py-1.5 rounded-lg border border-mist text-sm text-slate hover:border-red-500 hover:text-red-600 disabled:opacity-50"
              >
                Abandon
              </button>
              <button
                onClick={handlePickedUp}
                disabled={acting}
                className="px-4 py-1.5 rounded-lg bg-white border border-forest text-forest text-sm font-medium hover:bg-forest hover:text-cream disabled:opacity-50"
              >
                {acting ? 'Saving…' : 'Mark picked up'}
              </button>
            </>
          )}
          {request.status === 'picked_up' && (
            <button
              onClick={handleDelivered}
              disabled={acting}
              className="px-4 py-1.5 rounded-lg bg-forest text-cream text-sm font-medium hover:opacity-90 disabled:opacity-50"
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
