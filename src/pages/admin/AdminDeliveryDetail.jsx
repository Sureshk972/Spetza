import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function dollars(cents) {
  if (!cents) return '—'
  return '$' + (cents / 100).toFixed(2)
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-slate">{label}</div>
      <div className="text-ink mt-0.5">{children ?? '—'}</div>
    </div>
  )
}

const STATUS_STYLE = {
  open: 'bg-teal/10 text-teal',
  accepted: 'bg-teal/10 text-teal',
  picked_up: 'bg-teal/10 text-teal',
  delivered: 'bg-green/10 text-green',
  cancelled: 'bg-red-100 text-red-500',
}

export default function AdminDeliveryDetail() {
  const { id } = useParams()
  const [delivery, setDelivery] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!hasSupabaseConfig) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('delivery_requests')
      .select(`
        *,
        sender:profiles!delivery_requests_sender_id_fkey(id, first_name, last_name),
        courier:profiles!delivery_requests_courier_id_fkey(id, first_name, last_name)
      `)
      .eq('id', id)
      .single()
    setDelivery(data)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="text-slate py-16 text-center">Loading…</div>
  if (!delivery) return <div className="text-slate py-16 text-center">Delivery not found.</div>

  const d = delivery
  const senderName = d.sender ? [d.sender.first_name, d.sender.last_name].filter(Boolean).join(' ') : '—'
  const courierName = d.courier ? [d.courier.first_name, d.courier.last_name].filter(Boolean).join(' ') : '—'

  return (
    <div>
      <Link to="/admin/deliveries" className="text-sm text-slate hover:text-ink">&larr; All deliveries</Link>

      <div className="flex items-center gap-4 mt-4 mb-8">
        <h1 className="font-display text-3xl font-black text-ink">{d.order_number}</h1>
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLE[d.status] ?? 'text-slate'}`}>
          {d.status?.replace('_', ' ')}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 p-6 rounded-xl border border-mist bg-white">
        <Field label="Sender">
          {d.sender ? <Link to={`/admin/users/${d.sender.id}`} className="text-teal hover:underline">{senderName}</Link> : '—'}
        </Field>
        <Field label="Courier">
          {d.courier ? <Link to={`/admin/users/${d.courier.id}`} className="text-teal hover:underline">{courierName}</Link> : 'Unclaimed'}
        </Field>
        <Field label="Price">{dollars(d.max_price_cents)}</Field>
        <Field label="Accepted Price">{dollars(d.accepted_price_cents)}</Field>
        <Field label="Platform Fee">{dollars(d.platform_fee_cents)}</Field>
        <Field label="Distance">{d.distance_miles ? `${Number(d.distance_miles).toFixed(1)} mi` : '—'}</Field>
        <Field label="Package Size"><span className="capitalize">{d.package_size ?? '—'}</span></Field>
        <Field label="Description">{d.package_description}</Field>
        {d.stripe_payment_intent_id && (
          <Field label="Stripe PI">
            <a
              href={`https://dashboard.stripe.com/payments/${d.stripe_payment_intent_id}`}
              target="_blank" rel="noreferrer"
              className="text-teal hover:underline text-xs"
            >
              {d.stripe_payment_intent_id} ↗
            </a>
          </Field>
        )}
      </div>

      {/* Addresses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <div className="p-5 rounded-xl border border-mist bg-white">
          <div className="text-xs uppercase tracking-widest text-slate mb-2">Pickup</div>
          <div className="text-ink text-sm">{d.pickup_address}</div>
        </div>
        <div className="p-5 rounded-xl border border-mist bg-white">
          <div className="text-xs uppercase tracking-widest text-slate mb-2">Dropoff</div>
          <div className="text-ink text-sm">{d.dropoff_address}</div>
        </div>
      </div>

      {/* Timeline */}
      <div className="mt-8 p-6 rounded-xl border border-mist bg-white">
        <div className="text-xs uppercase tracking-widest text-slate mb-4">Timeline</div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Created">{fmtDate(d.created_at)}</Field>
          <Field label="Accepted">{fmtDate(d.accepted_at)}</Field>
          <Field label="Picked Up">{fmtDate(d.picked_up_at)}</Field>
          <Field label="Delivered">{fmtDate(d.delivered_at)}</Field>
          <Field label="Cancelled">{fmtDate(d.cancelled_at)}</Field>
        </div>
      </div>
    </div>
  )
}
