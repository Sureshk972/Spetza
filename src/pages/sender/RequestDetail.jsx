import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { feeFor, totalFor } from '../../lib/pricing.js'
import RouteMap from '../../components/RouteMap.jsx'
import RatingPrompt from '../../components/RatingPrompt.jsx'
import RatingBadge from '../../components/RatingBadge.jsx'
import PackagePhoto from '../../components/PackagePhoto.jsx'
import DeliveryProofPhoto from '../../components/DeliveryProofPhoto.jsx'
import TipPrompt from '../../components/TipPrompt.jsx'
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh.js'
import { chime } from '../../lib/chime.js'

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
  returned: 'bg-teal/10 text-teal',
}

const statusLabel = {
  open: 'Open',
  accepted: 'Accepted',
  picked_up: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned to you',
}

export default function RequestDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [request, setRequest] = useState(null)
  const [courier, setCourier] = useState(null)
  const [courierPhotoUrl, setCourierPhotoUrl] = useState(null)
  const [pickupPin, setPickupPin] = useState(null)
  // Handback code, only relevant while a return_to_sender delivery is in
  // transit -- that's the window where a courier might turn up with the
  // package instead of a delivery.
  const [returnPin, setReturnPin] = useState(null)
  const [rated, setRated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)

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
      .eq('sender_id', user.id)
      .maybeSingle()
    setRequest(req ?? null)

    // Fetch codes from the sender-only table. Both live on the same row;
    // which one we surface depends on where the delivery is.
    if (req?.status === 'accepted' || req?.status === 'picked_up') {
      const { data: pinRow } = await supabase
        .from('delivery_pins')
        .select('pin, return_pin')
        .eq('delivery_request_id', req.id)
        .maybeSingle()
      setPickupPin(req.status === 'accepted' ? (pinRow?.pin ?? null) : null)
      setReturnPin(
        req.status === 'picked_up' && req.no_answer_policy === 'return_to_sender'
          ? (pinRow?.return_pin ?? null)
          : null,
      )
    } else {
      setPickupPin(null)
      setReturnPin(null)
    }

    if (req?.courier_id) {
      const { data: prof } = await supabase
        .from('public_profiles')
        .select('id, first_name, rating_avg, rating_count, selfie_path')
        .eq('id', req.courier_id)
        .maybeSingle()
      setCourier(prof ?? null)
      if (prof?.selfie_path) {
        const { data: signed } = await supabase.storage
          .from('courier-verification')
          .createSignedUrl(prof.selfie_path, 3600)
        setCourierPhotoUrl(signed?.signedUrl ?? null)
      } else {
        setCourierPhotoUrl(null)
      }
    } else {
      setCourier(null)
    }

    const { data: myRating } = await supabase
      .from('ratings')
      .select('id')
      .eq('delivery_request_id', id)
      .eq('rater_id', user.id)
      .maybeSingle()
    setRated(!!myRating)

    setLoading(false)
  }

  useEffect(() => { load() }, [id, user?.id])

  useRealtimeRefresh({
    channelName: id ? `sender-req:${id}` : null,
    table: 'delivery_requests',
    filter: id ? `id=eq.${id}` : null,
    refresh: load,
  })

  // Play a chime the moment the courier arrives so the sender knows to
  // check the door even if their attention has wandered. Only fires on
  // the null → set transition; a fresh page-load with the courier
  // already arrived stays silent.
  const [wasArrived, setWasArrived] = useState(false)
  useEffect(() => {
    const arrivedNow = !!request?.courier_arrived_at
    if (arrivedNow && !wasArrived) {
      chime()
    }
    setWasArrived(arrivedNow)
  }, [request?.courier_arrived_at, wasArrived])

  const handleCancel = async () => {
    // Only 'accepted' requests have an authorized PaymentIntent — 'open'
    // requests were never authorized because no courier has claimed them.
    const msg = request?.status === 'accepted'
      ? 'Cancel this delivery? The hold on your card will be released.'
      : 'Cancel this delivery? Your card has not been charged.'
    const ok = window.confirm(msg)
    if (!ok) return
    setCancelling(true)
    const { error } = await supabase.functions.invoke('cancel-delivery', {
      body: { delivery_request_id: request.id },
    })
    setCancelling(false)
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
        <Link to="/sender" className="text-sm text-slate hover:text-ink">&larr; back</Link>
        <div className="mt-6 text-slate">Request not found.</div>
      </div>
    )
  }

  const priceCents = request.accepted_price_cents ?? request.max_price_cents
  const feeCents = request.platform_fee_cents ?? feeFor(request.max_price_cents)
  const totalCents = request.accepted_price_cents != null
    ? request.accepted_price_cents + (request.platform_fee_cents ?? 0)
    : totalFor(request.max_price_cents)

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
      <Link to="/sender" className="text-sm text-slate hover:text-ink">&larr; back</Link>

      <div className="mt-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate">{request.order_number}</div>
          <h1 className="font-display text-3xl text-ink mt-1">Delivery details</h1>
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
              <span className="text-slate/70 mr-2">From</span>
              <span className="text-ink">{request.pickup_address}</span>
            </div>
            <div className="text-slate">
              <span className="text-slate/70 mr-2">To</span>
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

        {returnPin && (
          <div className="p-4 rounded-xl border border-teal/30 bg-teal/5">
            <div className="text-xs uppercase tracking-widest text-teal font-bold">Return code</div>
            <div className="mt-2 text-4xl font-bold tracking-[0.3em] text-ink text-center py-2">
              {returnPin}
            </div>
            <p className="text-sm text-slate text-center mt-1 leading-relaxed">
              You asked for this package back if nobody's there. If your courier returns it,
              give them this code.
            </p>
          </div>
        )}

        <div className="p-4 rounded-xl border border-mist bg-white">
          <div className="text-xs uppercase tracking-widest text-slate">Package</div>
          <div className="mt-2 flex items-start gap-3">
            <PackagePhoto path={request.package_photo_path} variant="thumbnail" />
            <div className="text-sm text-slate">{request.package_description}</div>
          </div>
        </div>

        {request.delivery_photo_path && (
          <div className="p-4 rounded-xl border border-green/30 bg-green/5">
            <div className="text-xs uppercase tracking-widest text-green font-bold">Delivered</div>
            <DeliveryProofPhoto path={request.delivery_photo_path} />
          </div>
        )}

        <div className="p-4 rounded-xl border border-mist bg-white">
          <div className="text-xs uppercase tracking-widest text-slate">Courier</div>
          {courier ? (
            <div className="mt-2 flex items-center gap-3">
              {courierPhotoUrl ? (
                <img
                  src={courierPhotoUrl}
                  alt={courier.first_name}
                  className="w-10 h-10 rounded-full object-cover border border-mist"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-mist flex items-center justify-center text-slate text-sm font-bold">
                  {(courier.first_name || '?')[0]}
                </div>
              )}
              <div>
                <div className="text-sm text-ink font-medium">{courier.first_name || 'Assigned'}</div>
                <RatingBadge avg={courier.rating_avg} count={courier.rating_count} />
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-slate">Waiting for a courier to accept.</div>
          )}
        </div>

        {request.status === 'accepted' && pickupPin && (
          <div className={`p-4 rounded-xl border ${
            request.courier_arrived_at
              ? 'border-green bg-green/5 ring-2 ring-green/30'
              : 'border-teal/30 bg-teal/5'
          }`}>
            {request.courier_arrived_at && (
              <div className="mb-3 p-3 rounded-lg bg-green/10 border border-green/30 text-center">
                <div className="text-sm font-bold text-green">🚗 Your courier has arrived!</div>
                <div className="text-xs text-slate mt-0.5">Share the code below to confirm the handoff</div>
              </div>
            )}
            <div className="text-xs uppercase tracking-widest text-teal font-bold">Pickup code</div>
            <div className="mt-2 text-4xl font-bold tracking-[0.3em] text-ink text-center py-2">
              {pickupPin}
            </div>
            <p className="text-sm text-slate text-center mt-1">
              {request.courier_arrived_at
                ? 'Tell your courier this code now.'
                : 'Share this code with your courier when they arrive to confirm the handoff.'}
            </p>
          </div>
        )}

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
          <div className="text-xs uppercase tracking-widest text-slate">Payment</div>
          <Row label="Delivery" value={dollars(totalCents)} />
          {request.tip_cents > 0 && (
            <Row label="Tip" value={dollars(request.tip_cents)} />
          )}
          <div className="border-t border-slate/20 pt-1.5 flex justify-between items-baseline">
            <span className="text-xs uppercase tracking-widest text-ink">Total</span>
            <span className="font-display text-xl text-ink">{dollars(totalCents + (request.tip_cents || 0))}</span>
          </div>
          <div className="text-xs text-slate pt-1">
            {request.status === 'delivered'
              ? 'Charged.'
              : request.status === 'cancelled'
              ? 'Not charged. Any hold has been released.'
              : request.stripe_payment_intent_id
              ? 'Authorized. Charged when the courier marks delivered.'
              : 'Nothing authorized yet.'}
          </div>
        </div>

        {(request.status === 'delivered' || request.status === 'returned') && courier && !rated && (
          <div className="p-4 rounded-xl border border-mist bg-white">
            <RatingPrompt
              request={request}
              raterId={user.id}
              rateeId={request.courier_id}
              rateeLabel="courier"
              onSubmitted={load}
            />
          </div>
        )}

        {(request.status === 'delivered' || request.status === 'returned') && courier && (
          <div className="p-4 rounded-xl border border-green/20 bg-green/5">
            <TipPrompt
              request={request}
              courierName={courier.first_name || 'your courier'}
              onTipped={load}
            />
          </div>
        )}
      </section>

      <div className="mt-6 flex justify-end gap-2">
        {request.status === 'open' && (
          <button
            onClick={() => navigate(`/sender/requests/${request.id}/edit`)}
            className="px-3 py-1.5 rounded-lg border border-mist text-sm text-slate hover:border-ink hover:text-ink"
          >
            Edit
          </button>
        )}
        {(request.status === 'open' || request.status === 'accepted') && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="px-3 py-1.5 rounded-lg border border-mist text-sm text-slate hover:border-red-500 hover:text-red-600 disabled:opacity-50"
          >
            {cancelling ? 'Cancelling…' : 'Cancel delivery'}
          </button>
        )}
      </div>
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
