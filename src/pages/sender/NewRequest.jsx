import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import PackagePhotoInput from '../../components/PackagePhotoInput.jsx'
import { MAX_DISTANCE_MILES, priceForDistance, feeFor, totalFor } from '../../lib/pricing.js'
import { geocodeAddress, haversineMiles } from '../../lib/geocode.js'

const money = (cents) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`)

const blankGeo = { status: 'idle', lat: null, lng: null, formatted: null, error: null }

export default function NewRequest() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pickup, setPickup] = useState('')
  const [dropoff, setDropoff] = useState('')
  const [pickupGeo, setPickupGeo] = useState(blankGeo)
  const [dropoffGeo, setDropoffGeo] = useState(blankGeo)
  const [description, setDescription] = useState('')
  const [size, setSize] = useState('')
  const [photoPath, setPhotoPath] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const distance = useMemo(() => {
    if (pickupGeo.status !== 'ok' || dropoffGeo.status !== 'ok') return null
    return haversineMiles(pickupGeo.lat, pickupGeo.lng, dropoffGeo.lat, dropoffGeo.lng)
  }, [pickupGeo, dropoffGeo])

  const overMax = distance != null && distance > MAX_DISTANCE_MILES
  const priceCents = overMax ? null : priceForDistance(distance ?? NaN)
  const feeCents = feeFor(priceCents)
  const totalCents = totalFor(priceCents)

  const handleGeocode = async (address, setGeo) => {
    if (!address.trim()) {
      setGeo(blankGeo)
      return
    }
    setGeo({ ...blankGeo, status: 'loading' })
    const result = await geocodeAddress(address)
    if (result.error) {
      setGeo({ ...blankGeo, status: 'error', error: result.error })
      return
    }
    setGeo({
      status: 'ok',
      lat: result.lat,
      lng: result.lng,
      formatted: result.formattedAddress,
      error: null,
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!hasSupabaseConfig) {
      toast.error('Supabase not configured.')
      return
    }
    if (pickupGeo.status !== 'ok' || dropoffGeo.status !== 'ok') {
      toast.error('Both addresses need to resolve before posting.')
      return
    }
    if (distance == null) {
      toast.error('Could not compute distance.')
      return
    }
    if (distance > MAX_DISTANCE_MILES) {
      toast.error(`That route is ${distance.toFixed(1)} mi — max is ${MAX_DISTANCE_MILES} mi.`)
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
      pickup_address: pickupGeo.formatted || pickup,
      pickup_lat: pickupGeo.lat,
      pickup_lng: pickupGeo.lng,
      dropoff_address: dropoffGeo.formatted || dropoff,
      dropoff_lat: dropoffGeo.lat,
      dropoff_lng: dropoffGeo.lng,
      package_description: description,
      distance_miles: Number(distance.toFixed(2)),
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

  const canSubmit =
    !submitting &&
    pickupGeo.status === 'ok' &&
    dropoffGeo.status === 'ok' &&
    distance != null &&
    !overMax &&
    priceCents != null

  return (
    <div className="min-h-full px-6 py-12 max-w-xl mx-auto">
      <Link to="/sender" className="text-sm text-slate hover:text-ink">&larr; back</Link>
      <h1 className="font-serif text-3xl text-ink mt-6">New delivery request</h1>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <AddressField
          label="Pickup address"
          placeholder="123 Main St, San Francisco"
          value={pickup}
          onChange={(v) => {
            setPickup(v)
            if (pickupGeo.status !== 'idle') setPickupGeo(blankGeo)
          }}
          onBlur={() => handleGeocode(pickup, setPickupGeo)}
          geo={pickupGeo}
        />
        <AddressField
          label="Dropoff address"
          placeholder="456 Oak Ave, San Francisco"
          value={dropoff}
          onChange={(v) => {
            setDropoff(v)
            if (dropoffGeo.status !== 'idle') setDropoffGeo(blankGeo)
          }}
          onBlur={() => handleGeocode(dropoff, setDropoffGeo)}
          geo={dropoffGeo}
        />
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
        <Field label="Photo of the package">
          <PackagePhotoInput path={photoPath} onChange={setPhotoPath} />
        </Field>

        <div className="rounded-lg bg-mist px-4 py-3 space-y-1.5">
          <Row
            label="Distance"
            value={distance == null ? '—' : `${distance.toFixed(1)} mi`}
          />
          <Row label="Delivery" value={money(priceCents)} />
          <Row label="Service fee (15%)" value={money(feeCents)} />
          <div className="border-t border-slate/20 pt-1.5 flex justify-between items-baseline">
            <span className="text-xs uppercase tracking-widest text-ink">Total</span>
            <span className="font-serif text-xl text-ink">{money(totalCents)}</span>
          </div>
          {overMax && (
            <div className="text-xs text-signal pt-1">
              Over the {MAX_DISTANCE_MILES} mi limit.
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full px-4 py-3 rounded-lg bg-ink text-cream font-medium hover:bg-signal transition-colors disabled:opacity-50"
        >
          {submitting ? 'Posting…' : 'Post request'}
        </button>
      </form>
    </div>
  )
}

function AddressField({ label, placeholder, value, onChange, onBlur, geo }) {
  return (
    <Field label={label}>
      <input
        type="text"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
      />
      <GeoCaption geo={geo} />
    </Field>
  )
}

function GeoCaption({ geo }) {
  if (geo.status === 'idle') return null
  if (geo.status === 'loading') {
    return <div className="text-xs text-slate mt-1.5">Looking up address…</div>
  }
  if (geo.status === 'error') {
    return <div className="text-xs text-signal mt-1.5">{geo.error}</div>
  }
  return (
    <div className="text-xs text-slate mt-1.5 truncate">
      <span className="text-ink">✓</span> {geo.formatted}
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
