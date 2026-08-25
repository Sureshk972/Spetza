import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import PackagePhotoInput from '../../components/PackagePhotoInput.jsx'
import StructuredAddressInput from '../../components/StructuredAddressInput.jsx'
import { MAX_DISTANCE_MILES, priceForDistance, feeFor, totalFor } from '../../lib/pricing.js'
import { geocodeAddress, haversineMiles } from '../../lib/geocode.js'

const money = (cents) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`)

const blankGeo = { status: 'idle', lat: null, lng: null, formatted: null, error: null }

export default function EditRequest() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [request, setRequest] = useState(null)
  const [pickup, setPickup] = useState('')
  const [dropoff, setDropoff] = useState('')
  const [pickupGeo, setPickupGeo] = useState(blankGeo)
  const [dropoffGeo, setDropoffGeo] = useState(blankGeo)
  const [description, setDescription] = useState('')
  const [size, setSize] = useState('')
  const [photoPath, setPhotoPath] = useState(null)
  const [liabilityAccepted, setLiabilityAccepted] = useState(false)
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
          setSize(data.package_size ?? '')
          setPhotoPath(data.package_photo_path ?? null)
          if (data.pickup_lat != null && data.pickup_lng != null) {
            setPickupGeo({
              status: 'ok',
              lat: Number(data.pickup_lat),
              lng: Number(data.pickup_lng),
              formatted: data.pickup_address,
              error: null,
            })
          }
          if (data.dropoff_lat != null && data.dropoff_lng != null) {
            setDropoffGeo({
              status: 'ok',
              lat: Number(data.dropoff_lat),
              lng: Number(data.dropoff_lng),
              formatted: data.dropoff_address,
              error: null,
            })
          }
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, user])

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

  const handleSave = async (e) => {
    e.preventDefault()
    if (!request) return
    if (request.status !== 'open') {
      toast.error('Only open requests can be edited.')
      return
    }
    if (pickupGeo.status !== 'ok' || dropoffGeo.status !== 'ok') {
      toast.error('Both addresses need to resolve before saving.')
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
    if (!liabilityAccepted) {
      toast.error('Please acknowledge the liability disclaimer.')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('delivery_requests')
      .update({
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
        <h1 className="font-display text-3xl text-ink">Edit request</h1>
        <span className="text-xs uppercase tracking-widest text-slate">{request.order_number}</span>
      </div>

      {locked && (
        <div className="mt-6 p-4 rounded-lg bg-mist text-slate text-sm">
          This request is <strong className="text-ink">{request.status}</strong> and can no longer be changed.
        </div>
      )}

      <form onSubmit={handleSave} className="mt-8 space-y-5">
        <Field label="Pickup address">
          <StructuredAddressInput
            value={pickup}
            disabled={locked}
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
            disabled={locked}
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
        <Field label="Package description">
          <textarea
            required
            disabled={locked}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-teal focus:outline-none disabled:opacity-60"
          />
        </Field>
        <Field label="Approx. size">
          <input
            type="text"
            required
            disabled={locked}
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="Shoebox, envelope, etc."
            className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-teal focus:outline-none disabled:opacity-60"
          />
        </Field>
        <Field label="Photo of the package">
          <PackagePhotoInput path={photoPath} onChange={setPhotoPath} disabled={locked} />
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
            <div className="text-xs text-teal pt-1">
              Over the {MAX_DISTANCE_MILES} mi limit.
            </div>
          )}
        </div>

        {!locked && (
          <label className="flex items-start gap-3 p-4 rounded-lg border border-mist bg-white cursor-pointer">
            <input
              type="checkbox"
              checked={liabilityAccepted}
              onChange={(e) => setLiabilityAccepted(e.target.checked)}
              className="mt-0.5 accent-teal"
            />
            <span className="text-xs text-slate leading-relaxed">
              By saving these changes, I confirm that Spetza is a marketplace connecting me
              with independent couriers. Spetza is not liable for loss, damage, or delay.
              Delivery is at my own risk.
            </span>
          </label>
        )}

        {!locked && (
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || cancelling || !liabilityAccepted}
              className="flex-1 px-4 py-3 rounded-lg bg-teal text-white font-medium hover:bg-teal/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving || cancelling}
              className="px-4 py-3 rounded-lg border border-mist text-slate hover:text-teal hover:border-teal transition-colors disabled:opacity-50"
            >
              {cancelling ? 'Cancelling…' : 'Cancel request'}
            </button>
          </div>
        )}
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
    return <div className="text-xs text-teal mt-1.5">{geo.error}</div>
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
