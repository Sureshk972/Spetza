import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import PackagePhotoInput from '../../components/PackagePhotoInput.jsx'
import { MAX_WEIGHT_LBS, priceForWeight, tierOptions, feeFor, totalFor } from '../../lib/pricing.js'

const money = (cents) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`)

export default function EditRequest() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [request, setRequest] = useState(null)
  const [pickup, setPickup] = useState('')
  const [dropoff, setDropoff] = useState('')
  const [description, setDescription] = useState('')
  const [weightLbs, setWeightLbs] = useState('')
  const [size, setSize] = useState('')
  const [photoPath, setPhotoPath] = useState(null)
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (!hasSupabaseConfig || !user || !id) {
      setLoading(false)
      return
    }
    let cancelled = false
    supabase
      .from('delivery_requests')
      .select('*')
      .eq('id', id)
      .eq('sender_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setRequest(data)
        if (data) {
          setPickup(data.pickup_address)
          setDropoff(data.dropoff_address)
          setDescription(data.package_description)
          setWeightLbs(data.package_weight_lbs != null ? String(data.package_weight_lbs) : '')
          setSize(data.package_size ?? '')
          setPhotoPath(data.package_photo_path ?? null)
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, user])

  const weightNum = Number(weightLbs)
  const priceCents = useMemo(() => priceForWeight(weightNum), [weightNum])
  const feeCents = feeFor(priceCents)
  const totalCents = totalFor(priceCents)

  const handleSave = async (e) => {
    e.preventDefault()
    if (!request) return
    if (request.status !== 'open') {
      toast.error('Only open requests can be edited.')
      return
    }
    if (!Number.isFinite(weightNum) || weightNum <= 0) {
      toast.error('Enter a valid weight.')
      return
    }
    if (weightNum > MAX_WEIGHT_LBS) {
      toast.error(`Max weight is ${MAX_WEIGHT_LBS} lbs.`)
      return
    }
    if (priceCents == null) {
      toast.error('Weight is out of supported range.')
      return
    }
    if (!size.trim()) {
      toast.error('Add a size description.')
      return
    }
    if (!photoPath) {
      toast.error('A photo of the package is required.')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('delivery_requests')
      .update({
        pickup_address: pickup,
        dropoff_address: dropoff,
        package_description: description,
        package_weight_lbs: weightNum,
        package_size: size.trim() || null,
        package_photo_path: photoPath,
        max_price_cents: priceCents,
      })
      .eq('id', id)
      .eq('sender_id', user.id)
      .eq('status', 'open')
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Request updated.')
    navigate('/sender')
  }

  const handleCancel = async () => {
    if (!request) return
    if (request.status !== 'open') {
      toast.error('Only open requests can be cancelled.')
      return
    }
    const ok = window.confirm('Cancel this delivery request? This cannot be undone.')
    if (!ok) return
    const reallyOk = window.confirm('Do you really want to cancel this delivery request?')
    if (!reallyOk) return
    setCancelling(true)
    const { error } = await supabase
      .from('delivery_requests')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('sender_id', user.id)
      .eq('status', 'open')
    setCancelling(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Request cancelled.')
    navigate('/sender')
  }

  if (loading) {
    return <div className="min-h-full px-6 py-12 max-w-xl mx-auto text-slate">Loading…</div>
  }
  if (!request) {
    return (
      <div className="min-h-full px-6 py-12 max-w-xl mx-auto">
        <Link to="/sender" className="text-sm text-slate hover:text-ink">&larr; back</Link>
        <p className="mt-6 text-slate">Request not found.</p>
      </div>
    )
  }

  const locked = request.status !== 'open'

  return (
    <div className="min-h-full px-6 py-12 max-w-xl mx-auto">
      <Link to="/sender" className="text-sm text-slate hover:text-ink">&larr; back</Link>
      <div className="mt-6 flex items-baseline justify-between gap-4">
        <h1 className="font-serif text-3xl text-ink">Edit request</h1>
        <span className="text-xs uppercase tracking-widest text-slate">{request.order_number}</span>
      </div>

      {locked && (
        <div className="mt-6 p-4 rounded-lg bg-mist text-slate text-sm">
          This request is <strong className="text-ink">{request.status}</strong> and can no longer be changed.
        </div>
      )}

      <form onSubmit={handleSave} className="mt-8 space-y-5">
        <Field label="Pickup address">
          <input
            type="text"
            required
            disabled={locked}
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none disabled:opacity-60"
          />
        </Field>
        <Field label="Dropoff address">
          <input
            type="text"
            required
            disabled={locked}
            value={dropoff}
            onChange={(e) => setDropoff(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none disabled:opacity-60"
          />
        </Field>
        <Field label="Package description">
          <textarea
            required
            disabled={locked}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none disabled:opacity-60"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Weight (max ${MAX_WEIGHT_LBS} lbs)`}>
            <select
              required
              disabled={locked}
              value={weightLbs}
              onChange={(e) => setWeightLbs(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none disabled:opacity-60"
            >
              <option value="">Pick a range…</option>
              {tierOptions().map((t) => (
                <option key={t.upTo} value={t.upTo}>
                  {t.label} — {t.priceLabel}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Approx. size">
            <input
              type="text"
              required
              disabled={locked}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="Shoebox, envelope, etc."
              className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none disabled:opacity-60"
            />
          </Field>
        </div>
        <Field label="Photo of the package">
          <PackagePhotoInput path={photoPath} onChange={setPhotoPath} disabled={locked} />
        </Field>
        <div className="rounded-lg bg-mist px-4 py-3 space-y-1.5">
          <Row label="Delivery" value={money(priceCents)} />
          <Row label="Service fee (15%)" value={money(feeCents)} />
          <div className="border-t border-slate/20 pt-1.5 flex justify-between items-baseline">
            <span className="text-xs uppercase tracking-widest text-ink">Total</span>
            <span className="font-serif text-xl text-ink">{money(totalCents)}</span>
          </div>
        </div>

        {!locked && (
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || cancelling}
              className="flex-1 px-4 py-3 rounded-lg bg-ink text-cream font-medium hover:bg-signal transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving || cancelling}
              className="px-4 py-3 rounded-lg border border-mist text-slate hover:text-signal hover:border-signal transition-colors disabled:opacity-50"
            >
              {cancelling ? 'Cancelling…' : 'Cancel request'}
            </button>
          </div>
        )}
      </form>
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

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-slate mb-2">{label}</div>
      {children}
    </label>
  )
}
