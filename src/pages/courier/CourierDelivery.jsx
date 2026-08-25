import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import RouteMap from '../../components/RouteMap.jsx'
import RatingPrompt from '../../components/RatingPrompt.jsx'
import RatingBadge from '../../components/RatingBadge.jsx'
import PackagePhoto from '../../components/PackagePhoto.jsx'
import { resizeImage } from '../../lib/resizeImage.js'
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
  returned: 'bg-teal/10 text-teal',
}

const statusLabel = {
  open: 'Open',
  accepted: 'Awaiting pickup',
  picked_up: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned to sender',
}

export default function CourierDelivery() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [request, setRequest] = useState(null)
  const [sender, setSender] = useState(null)
  const [rated, setRated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  // Proof of delivery. The courier must attach a photo of the drop before
  // the delivery can be closed -- complete-delivery rejects the call
  // without one, so this is a mirror of the server rule, not the rule.
  const [proofPath, setProofPath] = useState(null)
  // Return-to-sender: courier flips into handback mode and enters the code
  // the sender gives them at the door.
  const [returning, setReturning] = useState(false)
  const [returnPin, setReturnPin] = useState('')
  const [returnError, setReturnError] = useState('')
  const [reporting, setReporting] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportNote, setReportNote] = useState('')
  const [uploadingProof, setUploadingProof] = useState(false)
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
    // mark-arrived does the DB update AND fans out push/SMS to the sender.
    // Previous version was a raw client update — the toast lied because
    // no notification actually fired.
    const { error } = await supabase.functions.invoke('mark-arrived', {
      body: { delivery_request_id: request.id },
    })
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

  const PROOF_BUCKET = 'delivery-proof'
  const MAX_PROOF_BYTES = 15 * 1024 * 1024

  const onProofPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Pick an image file.'); return }
    if (file.size > MAX_PROOF_BYTES) { toast.error('Image must be under 15 MB.'); return }
    setUploadingProof(true)
    let uploadFile = file
    try {
      uploadFile = await resizeImage(file)
    } catch {
      // Resize failed — upload the original rather than block a courier
      // who is standing on a doorstep.
    }
    const ext = uploadFile.type === 'image/jpeg' ? 'jpg' : (uploadFile.name.split('.').pop() || 'jpg')
    // Path must start with the delivery id: storage RLS and complete-delivery
    // both key off that first segment.
    const objectPath = `${request.id}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from(PROOF_BUCKET)
      .upload(objectPath, uploadFile, { contentType: uploadFile.type })
    setUploadingProof(false)
    if (upErr) {
      toast.error("Couldn't upload that photo. Check your signal and try again.")
      return
    }
    setProofPath(objectPath)
  }

  const handleDelivered = async () => {
    if (!proofPath) {
      toast.error('Add a photo of the drop-off first.')
      return
    }
    const ok = window.confirm(
      `Confirm delivered? You'll earn ${dollars(courierTake)}.`,
    )
    if (!ok) return
    setActing(true)
    const { error } = await supabase.functions.invoke('complete-delivery', {
      body: { delivery_request_id: request.id, delivery_photo_path: proofPath },
    })
    setActing(false)
    if (error) {
      toast.error(error.message)
      return
    }
    load()
  }

  const RETURN_ERROR_COPY = {
    return_pin_mismatch: "That code doesn't match. Ask your sender to read it again.",
    return_locked: 'Too many tries. Wait 15 minutes and try again.',
    no_return_pin: 'No return code on this delivery. Contact support.',
    policy_mismatch: 'This delivery is set to leave at the door, not return.',
  }

  const handleReturned = async () => {
    setReturnError('')
    if (!/^\d{4}$/.test(returnPin)) {
      setReturnError('Enter the 4-digit code from your sender.')
      return
    }
    const ok = window.confirm(
      `Confirm returned to sender? You'll earn ${dollars(courierTake)}.`,
    )
    if (!ok) return
    setActing(true)
    const { data, error } = await supabase.functions.invoke('complete-delivery', {
      body: {
        delivery_request_id: request.id,
        outcome: 'returned',
        return_pin: returnPin,
        ...(proofPath ? { delivery_photo_path: proofPath } : {}),
      },
    })
    setActing(false)
    if (error || data?.error) {
      const code = data?.code
      setReturnError(RETURN_ERROR_COPY[code] || data?.error || error?.message || 'Something went wrong.')
      return
    }
    setReturnPin('')
    load()
  }

  const REPORT_REASONS = [
    { value: 'too_heavy', label: 'Heavier than described' },
    { value: 'wrong_size', label: 'Bigger than the size given' },
    { value: 'prohibited_item', label: "Something we don't carry" },
    { value: 'not_as_described', label: 'Not what was described' },
  ]

  const handleReport = async () => {
    if (!reportReason) return
    const ok = window.confirm(
      "Report this package and end the delivery? The sender won't be charged, and we'll review it.",
    )
    if (!ok) return
    setActing(true)
    const { data, error } = await supabase.functions.invoke('report-delivery', {
      body: { delivery_request_id: request.id, reason: reportReason, note: reportNote || null },
    })
    setActing(false)
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Couldn't file that report.")
      return
    }
    toast.success('Reported. Thanks — we’ll take a look.')
    navigate('/courier')
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
            {/* "Paid out" used to appear here the moment a delivery closed,
                which reads as "it's in my bank". It isn't: capture moves the
                money to the courier's Stripe balance, and Stripe pays out on
                its own schedule. */}
            {request.status === 'delivered' || request.status === 'returned'
              ? 'In your Stripe balance. Reaches your bank in about 2 business days — your first payout can take up to 14.'
              : request.status === 'cancelled'
              ? 'No payout — the hold was released.'
              : 'Paid when you close this delivery.'}
          </div>
        </div>

        {(request.status === 'delivered' || request.status === 'returned') && !rated && (
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
                  href={mapsUrl(request.pickup_address)}
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

              {/* Distinct from Abandon on purpose. Abandoning hands the
                  package to the next courier; reporting says the listing
                  itself is wrong, so the delivery ends here instead of
                  sending someone else to the same doorstep. */}
              {!reporting ? (
                <button
                  onClick={() => setReporting(true)}
                  disabled={acting}
                  className="mt-3 w-full py-2 text-xs text-slate hover:text-ink underline underline-offset-4 disabled:opacity-50 transition-colors"
                >
                  This package isn't as described
                </button>
              ) : (
                <div className="mt-3 p-4 rounded-xl border border-red-200 bg-red-50/40">
                  <div className="text-xs uppercase tracking-widest text-red-600 font-bold">
                    Report this package
                  </div>
                  <p className="text-xs text-slate mt-1 leading-relaxed">
                    This ends the delivery — it won't go to another courier. The sender isn't
                    charged, and we review every report.
                  </p>
                  <div className="mt-3 space-y-1.5">
                    {REPORT_REASONS.map((r) => (
                      <label
                        key={r.value}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-sm transition-colors ${
                          reportReason === r.value
                            ? 'border-red-400 bg-white'
                            : 'border-mist bg-white hover:border-slate/30'
                        }`}
                      >
                        <input
                          type="radio"
                          name="report_reason"
                          value={r.value}
                          checked={reportReason === r.value}
                          onChange={(e) => setReportReason(e.target.value)}
                          className="accent-red-500 shrink-0"
                        />
                        <span className="text-ink">{r.label}</span>
                      </label>
                    ))}
                  </div>
                  <textarea
                    value={reportNote}
                    onChange={(e) => setReportNote(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    placeholder="Anything else we should know? (optional)"
                    className="mt-3 w-full px-3 py-2 rounded-lg bg-white border border-mist text-sm focus:border-teal focus:outline-none"
                  />
                  <button
                    onClick={handleReport}
                    disabled={acting || !reportReason}
                    className="mt-3 w-full py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {acting ? 'Reporting\u2026' : 'Report and end delivery'}
                  </button>
                  <button
                    onClick={() => { setReporting(false); setReportReason(''); setReportNote('') }}
                    disabled={acting}
                    className="mt-2 w-full py-2 text-xs text-slate hover:text-ink transition-colors"
                  >
                    Never mind
                  </button>
                </div>
              )}
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
            <div className="w-full space-y-3">
              <div className="p-4 rounded-xl border border-green/30 bg-green/5">
                <div className="text-xs uppercase tracking-widest text-green font-bold mb-2">Head to dropoff</div>
                <div className="mt-2 p-3 rounded-lg bg-white border border-mist">
                  <div className="text-sm text-ink font-medium">{request.dropoff_address}</div>
                </div>
                <a
                  href={mapsUrl(request.dropoff_address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm text-green hover:underline"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="3 11 22 2 13 21 11 13 3 11" />
                  </svg>
                  Open in Maps
                </a>
                {/* The sender's standing instruction. Shown before the
                    photo control so a courier reads it while deciding what
                    to do, not after they've already left the package. */}
                <div className={`mt-3 p-3 rounded-lg border text-xs leading-relaxed ${
                  request.no_answer_policy === 'return_to_sender'
                    ? 'border-teal/30 bg-teal/5 text-ink'
                    : 'border-mist bg-white text-slate'
                }`}>
                  <span className="uppercase tracking-widest text-[10px] text-slate">
                    If nobody's there
                  </span>
                  <div className="mt-1">
                    {request.no_answer_policy === 'return_to_sender'
                      ? 'Bring it back to the sender. They\u2019ll give you a 4-digit code at handback \u2014 you earn the same as a delivery.'
                      : 'You can leave it in a safe spot. Photograph exactly where you left it.'}
                  </div>
                </div>

                {request.no_answer_policy === 'return_to_sender' && !returning && (
                  <button
                    onClick={() => setReturning(true)}
                    disabled={acting}
                    className="mt-3 w-full py-2.5 rounded-lg border border-teal/40 text-teal text-sm font-medium hover:bg-teal/5 transition-colors disabled:opacity-50"
                  >
                    Nobody's here — return to sender
                  </button>
                )}

                {returning && (
                  <div className="mt-3 p-4 rounded-lg border border-teal/40 bg-white">
                    <div className="text-xs uppercase tracking-widest text-teal font-bold">
                      Returning to sender
                    </div>
                    <div className="mt-2 p-3 rounded-lg bg-mist">
                      <div className="text-sm text-ink font-medium">{request.pickup_address}</div>
                    </div>
                    <a
                      href={mapsUrl(request.pickup_address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-2 text-sm text-teal hover:underline"
                    >
                      Open in Maps
                    </a>
                    <p className="mt-3 text-xs text-slate leading-relaxed">
                      Ask your sender for their 4-digit return code when you hand the package back.
                    </p>
                    <input
                      inputMode="numeric"
                      pattern="\d{4}"
                      maxLength={4}
                      value={returnPin}
                      onChange={(e) => { setReturnPin(e.target.value.replace(/\D/g, '')); setReturnError('') }}
                      placeholder="0000"
                      className="mt-2 w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-teal focus:outline-none text-center text-2xl tracking-widest"
                    />
                    {returnError && <p className="mt-2 text-xs text-red-600">{returnError}</p>}
                    <button
                      onClick={handleReturned}
                      disabled={acting || returnPin.length !== 4}
                      className="mt-3 w-full py-3 rounded-lg bg-teal text-white text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {acting ? 'Confirming\u2026' : 'Confirm returned'}
                    </button>
                    <button
                      onClick={() => { setReturning(false); setReturnPin(''); setReturnError('') }}
                      disabled={acting}
                      className="mt-2 w-full py-2 text-xs text-slate hover:text-ink transition-colors"
                    >
                      Cancel — I can still deliver it
                    </button>
                  </div>
                )}

                {/* Proof of delivery. `capture="environment"` opens the rear
                    camera on a phone; on a denied permission or a desktop the
                    same input still falls back to the photo library, so a
                    courier is never locked out of finishing the job. */}
                <div className={`mt-4 p-3 rounded-lg bg-white border border-mist ${returning ? 'hidden' : ''}`}>
                  <div className="text-xs uppercase tracking-widest text-slate mb-1">
                    Photo of the drop
                  </div>
                  <p className="text-xs text-slate/80 leading-relaxed">
                    {proofPath
                      ? 'Photo attached. Your sender will see this.'
                      : 'Required. Show the package where you left it, or in the recipient\u2019s hands.'}
                  </p>
                  <label className="mt-3 block">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={onProofPhoto}
                      disabled={uploadingProof || acting}
                      className="hidden"
                    />
                    <span className={`block w-full py-2.5 rounded-lg border text-center text-sm font-medium cursor-pointer transition-colors ${
                      proofPath
                        ? 'border-green/40 text-green hover:bg-green/5'
                        : 'border-ink/20 text-ink hover:bg-mist'
                    }`}>
                      {uploadingProof
                        ? 'Uploading\u2026'
                        : proofPath ? 'Retake photo' : 'Take photo'}
                    </span>
                  </label>
                </div>

                <button
                  onClick={handleDelivered}
                  disabled={acting || uploadingProof || !proofPath}
                  className={`mt-3 w-full py-3 rounded-lg bg-green text-white text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-opacity ${returning ? 'hidden' : ''}`}
                >
                  {acting ? 'Capturing payment\u2026' : 'Mark delivered'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// google.com/maps works on iOS (redirects to Apple Maps if you have it),
// Android (opens Google Maps), and desktop — universal fallback rather
// than the Apple-only maps.apple.com URL we had before.
function mapsUrl(address) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
}
