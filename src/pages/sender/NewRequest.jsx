import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import PackagePhotoInput from '../../components/PackagePhotoInput.jsx'
import StructuredAddressInput from '../../components/StructuredAddressInput.jsx'
import RouteMap from '../../components/RouteMap.jsx'
import PricingTable from '../../components/PricingTable.jsx'
import { MAX_DISTANCE_MILES, priceForDistance, feeFor, totalFor } from '../../lib/pricing.js'
import { PACKAGE_SIZES } from '../../lib/packageSizes.js'
import { geocodeAddress, haversineMiles } from '../../lib/geocode.js'
import { trackEvent } from '../../lib/analytics.js'

const money = (cents) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`)

// Pull a 5-digit US zip out of a geocoder-formatted address string
// (e.g. "123 W Foster Ave, Chicago, IL 60640, USA" → "60640").
const zipFrom = (address) => {
  const m = (address || '').match(/\b(\d{5})(?:-\d{4})?\b/)
  return m ? m[1] : 'unknown'
}

const blankGeo = { status: 'idle', lat: null, lng: null, formatted: null, error: null }

export default function NewRequest() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const hasPaymentMethod = !!profile?.stripe_default_payment_method_id
  const [pickup, setPickup] = useState('')
  const [dropoff, setDropoff] = useState('')
  const [pickupGeo, setPickupGeo] = useState(blankGeo)
  const [dropoffGeo, setDropoffGeo] = useState(blankGeo)
  const [description, setDescription] = useState('')
  const [size, setSize] = useState('')
  const [photoPath, setPhotoPath] = useState(null)
  const [liabilityAccepted, setLiabilityAccepted] = useState(false)
  // What happens if nobody answers at the dropoff. Decided here, before
  // pickup, so the courier never has to improvise on a doorstep.
  const [noAnswerPolicy, setNoAnswerPolicy] = useState('leave_at_door')
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
    if (!size) {
      toast.error('Pick a package size.')
      return
    }
    if (!photoPath) {
      toast.error('A photo of the package is required.')
      return
    }
    if (!liabilityAccepted) {
      toast.error('Please acknowledge the liability disclaimer.')
      return
    }
    if (!hasPaymentMethod) {
      toast.error('Add a payment method before posting a delivery.')
      navigate('/sender/profile')
      return
    }
    setSubmitting(true)
    const pickupAddress = pickupGeo.formatted || pickup
    const dropoffAddress = dropoffGeo.formatted || dropoff
    const { data: inserted, error } = await supabase
      .from('delivery_requests')
      .insert({
        sender_id: user.id,
        pickup_address: pickupAddress,
        pickup_lat: pickupGeo.lat,
        pickup_lng: pickupGeo.lng,
        dropoff_address: dropoffAddress,
        dropoff_lat: dropoffGeo.lat,
        dropoff_lng: dropoffGeo.lng,
        package_description: description,
        distance_miles: Number(distance.toFixed(2)),
        package_size: size.trim() || null,
        package_photo_path: photoPath,
        max_price_cents: priceCents,
        no_answer_policy: noAnswerPolicy,
      })
      .select('id')
      .single()
    setSubmitting(false)
    if (error) {
      toast.error(error.message)
      return
    }
    trackEvent('delivery_posted', {
      delivery_id: inserted?.id,
      pickup_zip: zipFrom(pickupAddress),
      dropoff_zip: zipFrom(dropoffAddress),
      distance_miles: Number(distance.toFixed(2)),
      price_cents: priceCents,
    })
    toast.success('Request posted.')
    navigate('/sender')
  }

  const canSubmit =
    !submitting &&
    pickupGeo.status === 'ok' &&
    dropoffGeo.status === 'ok' &&
    distance != null &&
    !overMax &&
    priceCents != null &&
    liabilityAccepted &&
    hasPaymentMethod

  return (
    <div className="min-h-full px-6 py-12 max-w-xl mx-auto">
      <Link to="/sender" className="text-sm text-slate hover:text-ink">&larr; back</Link>
      <h1 className="font-display text-3xl text-ink mt-6">New delivery request</h1>

      {!hasPaymentMethod && (
        <div className="mt-6 p-4 rounded-lg border-2 border-teal/30 bg-teal/5 flex items-start gap-3">
          <span className="text-xl">💳</span>
          <div className="flex-1">
            <div className="text-sm font-bold text-ink">Add a payment method first</div>
            <p className="text-xs text-slate mt-1 leading-relaxed">
              We authorize your card when a courier accepts — you're not charged until it's delivered.
            </p>
            <Link
              to="/sender/profile"
              className="inline-block mt-2 text-sm text-teal font-semibold hover:underline"
            >
              Add a card →
            </Link>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <Field label="Pickup address">
          <StructuredAddressInput
            value={pickup}
            onChange={(v) => {
              setPickup(v)
              if (pickupGeo.status !== 'idle') setPickupGeo(blankGeo)
            }}
            onBlur={() => handleGeocode(pickup, setPickupGeo)}
            onResolved={({ lat, lng, formattedAddress }) =>
              setPickupGeo({
                status: 'ok',
                lat,
                lng,
                formatted: formattedAddress,
                error: null,
              })
            }
          />
          <GeoCaption geo={pickupGeo} />
        </Field>
        <Field label="Dropoff address">
          <StructuredAddressInput
            value={dropoff}
            onChange={(v) => {
              setDropoff(v)
              if (dropoffGeo.status !== 'idle') setDropoffGeo(blankGeo)
            }}
            onBlur={() => handleGeocode(dropoff, setDropoffGeo)}
            onResolved={({ lat, lng, formattedAddress }) =>
              setDropoffGeo({
                status: 'ok',
                lat,
                lng,
                formatted: formattedAddress,
                error: null,
              })
            }
          />
          <GeoCaption geo={dropoffGeo} />
        </Field>
        {pickupGeo.status === 'ok' && dropoffGeo.status === 'ok' && (
          <RouteMap
            pickup={{ lat: pickupGeo.lat, lng: pickupGeo.lng }}
            dropoff={{ lat: dropoffGeo.lat, lng: dropoffGeo.lng }}
          />
        )}

        <Field label="Package description">
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Small box. Fragile."
            rows={3}
            className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-teal focus:outline-none"
          />
        </Field>
        <Field label="Package size">
          <div className="grid grid-cols-2 gap-2">
            {PACKAGE_SIZES.map((s) => {
              const active = size === s.value
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSize(s.value)}
                  className={`text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                    active
                      ? 'border-teal bg-teal/5'
                      : 'border-mist bg-white hover:border-teal/40'
                  }`}
                >
                  <div className={`text-sm font-semibold ${active ? 'text-teal' : 'text-ink'}`}>{s.label}</div>
                  <div className="text-xs text-slate mt-0.5">{s.hint}</div>
                </button>
              )
            })}
          </div>
        </Field>
        <Field label="Photo of the package">
          <PackagePhotoInput path={photoPath} onChange={setPhotoPath} />
        </Field>

        <div className="rounded-lg bg-mist px-4 py-3 space-y-1.5">
          <Row
            label="Distance"
            value={distance == null ? '—' : `${distance.toFixed(1)} mi`}
          />
          <div className="flex justify-between items-baseline">
            <span className="text-xs uppercase tracking-widest text-ink">Total</span>
            <span className="font-display text-xl text-ink">{money(totalCents)}</span>
          </div>
          {overMax && (
            <div className="text-xs text-red-600 pt-1">
              Over the {MAX_DISTANCE_MILES} mi limit.
            </div>
          )}
        </div>

        <PricingTable variant="sender" />

        <div className="p-4 rounded-lg border border-mist bg-white">
          <div className="text-xs uppercase tracking-widest text-slate">
            If nobody's there
          </div>
          <p className="text-xs text-slate/80 mt-1 leading-relaxed">
            Your courier follows this without calling you.
          </p>
          <div className="mt-3 space-y-2">
            {[
              {
                value: 'leave_at_door',
                title: 'Leave it at the door',
                detail: 'Your courier photographs where they left it. Once it\u2019s down, it\u2019s on you.',
              },
              {
                value: 'return_to_sender',
                title: 'Bring it back to me',
                detail: 'You\u2019ll get a code to hand over when they return it. Costs the same either way.',
              },
            ].map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  noAnswerPolicy === opt.value
                    ? 'border-teal bg-teal/5'
                    : 'border-mist bg-white hover:border-slate/30'
                }`}
              >
                <input
                  type="radio"
                  name="no_answer_policy"
                  value={opt.value}
                  checked={noAnswerPolicy === opt.value}
                  onChange={(e) => setNoAnswerPolicy(e.target.value)}
                  className="mt-0.5 accent-teal shrink-0"
                />
                <span>
                  <span className="block text-sm text-ink font-medium">{opt.title}</span>
                  <span className="block text-xs text-slate leading-relaxed mt-0.5">{opt.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Kept factual and short. The sender flow is meant to feel easy, and
            a paragraph of threats at the moment of posting doesn't fit --
            the enforcement language lives in the Terms. */}
        <div className="p-4 rounded-lg border border-mist bg-white">
          <div className="text-xs uppercase tracking-widest text-slate">Describe it honestly</div>
          <p className="text-xs text-slate/90 mt-1.5 leading-relaxed">
            Your courier decides at the door whether to take it. If what turns up doesn't match
            what you wrote — heavier, larger, or something we don't carry — they can decline and
            report it. You won't be charged, and repeated reports can cost you access to Spetza.
          </p>
        </div>

        <label className="flex items-start gap-3 p-4 rounded-lg border border-mist bg-white cursor-pointer">
          <input
            type="checkbox"
            checked={liabilityAccepted}
            onChange={(e) => setLiabilityAccepted(e.target.checked)}
            className="mt-0.5 accent-teal"
          />
          <span className="text-xs text-slate leading-relaxed">
            By posting this delivery, I confirm that Spetza is a marketplace connecting me
            with independent couriers. Spetza is not liable for loss, damage, or delay.
            Delivery is at my own risk.
          </span>
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full px-4 py-3 rounded-lg bg-teal text-white font-medium hover:bg-teal/90 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Posting…' : 'Send it'}
        </button>
      </form>
    </div>
  )
}


function GeoCaption({ geo }) {
  if (geo.status === 'idle') return null
  if (geo.status === 'loading') {
    return <div className="text-xs text-slate mt-1.5">Looking up address…</div>
  }
  if (geo.status === 'error') {
    return <div className="text-xs text-red-600 mt-1.5">{geo.error}</div>
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
