import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import PackagePhotoInput from '../../components/PackagePhotoInput.jsx'
import { MAX_DISTANCE_MILES, priceForDistance, tierOptions, feeFor, totalFor } from '../../lib/pricing.js'

const money = (cents) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`)

export default function NewRequest() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pickup, setPickup] = useState('')
  const [dropoff, setDropoff] = useState('')
  const [description, setDescription] = useState('')
  const [distanceMiles, setDistanceMiles] = useState('')
  const [size, setSize] = useState('')
  const [photoPath, setPhotoPath] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const distanceNum = Number(distanceMiles)
  const priceCents = useMemo(() => priceForDistance(distanceNum), [distanceNum])
  const feeCents = feeFor(priceCents)
  const totalCents = totalFor(priceCents)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!hasSupabaseConfig) {
      toast.error('Supabase not configured.')
      return
    }
    if (!Number.isFinite(distanceNum) || distanceNum <= 0) {
      toast.error('Pick a distance range.')
      return
    }
    if (distanceNum > MAX_DISTANCE_MILES) {
      toast.error(`Max distance is ${MAX_DISTANCE_MILES} mi.`)
      return
    }
    if (priceCents == null) {
      toast.error('Distance is out of supported range.')
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
    setSubmitting(true)
    const { error } = await supabase.from('delivery_requests').insert({
      sender_id: user.id,
      pickup_address: pickup,
      dropoff_address: dropoff,
      package_description: description,
      distance_miles: distanceNum,
      package_size: size.trim() || null,
      package_photo_path: photoPath,
      max_price_cents: priceCents,
    })
    setSubmitting(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Request posted.')
    navigate('/sender')
  }

  return (
    <div className="min-h-full px-6 py-12 max-w-xl mx-auto">
      <Link to="/sender" className="text-sm text-slate hover:text-ink">&larr; back</Link>
      <h1 className="font-serif text-3xl text-ink mt-6">New delivery request</h1>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <Field label="Pickup address">
          <input
            type="text"
            required
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            placeholder="123 Main St"
            className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
          />
        </Field>
        <Field label="Dropoff address">
          <input
            type="text"
            required
            value={dropoff}
            onChange={(e) => setDropoff(e.target.value)}
            placeholder="456 Oak Ave"
            className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
          />
        </Field>
        <Field label="Package description">
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Small box. Fragile."
            rows={3}
            className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Distance (max ${MAX_DISTANCE_MILES} mi)`}>
            <select
              required
              value={distanceMiles}
              onChange={(e) => setDistanceMiles(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
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
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="Shoebox, envelope, etc."
              className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
            />
          </Field>
        </div>
        <Field label="Photo of the package">
          <PackagePhotoInput path={photoPath} onChange={setPhotoPath} />
        </Field>

        <div className="rounded-lg bg-mist px-4 py-3 space-y-1.5">
          <Row label="Delivery" value={money(priceCents)} />
          <Row label="Service fee (15%)" value={money(feeCents)} />
          <div className="border-t border-slate/20 pt-1.5 flex justify-between items-baseline">
            <span className="text-xs uppercase tracking-widest text-ink">Total</span>
            <span className="font-serif text-xl text-ink">{money(totalCents)}</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || priceCents == null}
          className="w-full px-4 py-3 rounded-lg bg-ink text-cream font-medium hover:bg-signal transition-colors disabled:opacity-50"
        >
          {submitting ? 'Posting…' : 'Post request'}
        </button>
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
