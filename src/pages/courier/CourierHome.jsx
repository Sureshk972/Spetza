import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { haversineMiles } from '../../lib/geocode.js'
import RouteMap from '../../components/RouteMap.jsx'
import RatingPrompt from '../../components/RatingPrompt.jsx'
import RatingBadge from '../../components/RatingBadge.jsx'
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh.js'

function dollars(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

function timeLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function photoUrl(path) {
  if (!path) return null
  const { data } = supabase.storage.from('package-photos').getPublicUrl(path)
  return data.publicUrl
}

export default function CourierHome() {
  const { profile, user } = useAuth()
  const [requests, setRequests] = useState([])
  const [active, setActive] = useState([])
  const [recent, setRecent] = useState([])
  const [ratedIds, setRatedIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(null)
  const [progressing, setProgressing] = useState(null)

  const serviceArea =
    profile?.home_lat != null &&
    profile?.home_lng != null &&
    profile?.service_radius_miles != null
      ? {
          lat: Number(profile.home_lat),
          lng: Number(profile.home_lng),
          radius: Number(profile.service_radius_miles),
        }
      : null

  const refresh = () => {
    if (!hasSupabaseConfig) {
      setLoading(false)
      return
    }
    setLoading(true)
    Promise.all([
      supabase
        .from('delivery_requests')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false }),
      user
        ? supabase
            .from('delivery_requests')
            .select('*')
            .eq('courier_id', user.id)
            .in('status', ['accepted', 'picked_up'])
            .order('accepted_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      user
        ? supabase
            .from('delivery_requests')
            .select('*')
            .eq('courier_id', user.id)
            .eq('status', 'delivered')
            .order('delivered_at', { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] }),
      user
        ? supabase
            .from('ratings')
            .select('delivery_request_id')
            .eq('rater_id', user.id)
        : Promise.resolve({ data: [] }),
    ]).then(([openRes, activeRes, recentRes, ratedRes]) => {
      setRequests(openRes.data ?? [])
      setActive(activeRes.data ?? [])
      setRecent(recentRes.data ?? [])
      setRatedIds(new Set((ratedRes.data ?? []).map((r) => r.delivery_request_id)))
      setLoading(false)
    })
  }

  useEffect(() => {
    refresh()
  }, [user?.id])

  useRealtimeRefresh({
    channelName: 'courier-home:open',
    table: 'delivery_requests',
    filter: 'status=eq.open',
    refresh,
  })

  useRealtimeRefresh({
    channelName: user ? `courier-home:mine:${user.id}` : null,
    table: 'delivery_requests',
    filter: user ? `courier_id=eq.${user.id}` : null,
    refresh,
    enabled: !!user,
  })

  const visibleRequests = useMemo(() => {
    if (!serviceArea) return []
    return requests
      .map((r) => {
        if (r.pickup_lat == null || r.pickup_lng == null) return null
        const miles = haversineMiles(
          serviceArea.lat,
          serviceArea.lng,
          Number(r.pickup_lat),
          Number(r.pickup_lng),
        )
        if (miles == null || miles > serviceArea.radius) return null
        return { ...r, miles_from_you: miles }
      })
      .filter(Boolean)
  }, [requests, serviceArea])

  const handleAccept = async (request) => {
    const ok = window.confirm(
      `Accept this delivery for $${(request.max_price_cents / 100).toFixed(2)}?`,
    )
    if (!ok) return
    setAccepting(request.id)
    const { error } = await supabase.functions.invoke(
      'accept-delivery-request',
      { body: { delivery_request_id: request.id } },
    )
    setAccepting(null)
    if (error) {
      alert(error.message)
      return
    }
    refresh()
  }

  const handlePickedUp = async (request) => {
    setProgressing(request.id)
    const { error } = await supabase
      .from('delivery_requests')
      .update({ status: 'picked_up', picked_up_at: new Date().toISOString() })
      .eq('id', request.id)
      .eq('courier_id', user.id)
      .eq('status', 'accepted')
    setProgressing(null)
    if (error) {
      alert(error.message)
      return
    }
    refresh()
  }

  const handleDelivered = async (request) => {
    const ok = window.confirm(
      `Confirm delivered? The sender will be charged ${dollars(request.max_price_cents)}.`,
    )
    if (!ok) return
    setProgressing(request.id)
    const { error } = await supabase.functions.invoke(
      'complete-delivery',
      { body: { delivery_request_id: request.id } },
    )
    setProgressing(null)
    if (error) {
      alert(error.message)
      return
    }
    refresh()
  }

  const handleAbandon = async (request) => {
    const ok = window.confirm(
      "Abandon this delivery? It will go back to the open list for another courier.",
    )
    if (!ok) return
    setProgressing(request.id)
    const { error } = await supabase.functions.invoke(
      'cancel-delivery',
      { body: { delivery_request_id: request.id } },
    )
    setProgressing(null)
    if (error) {
      alert(error.message)
      return
    }
    refresh()
  }

  return (
    <div className="min-h-full">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <header>
          <div className="flex items-center gap-3">
            <p className="text-xs uppercase tracking-widest text-forest">Courier</p>
            <span className="text-slate/40">·</span>
            <h1 className="font-serif text-4xl text-ink">Discover</h1>
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-slate">
            <RatingBadge avg={profile?.rating_avg} count={profile?.rating_count} />
            {serviceArea && (
              <>
                <span className="text-slate/40">·</span>
                <span>Within {serviceArea.radius} mi of your home</span>
              </>
            )}
          </div>
        </header>

        {profile?.verification_status !== 'approved' && (
          <div className="mt-8 p-4 rounded-xl border border-signal/40 bg-signal/5">
            {profile?.verification_status === 'pending' ? (
              <>
                <div className="text-sm text-ink font-medium">Verification pending</div>
                <div className="text-sm text-slate mt-1">
                  We're reviewing your documents. You can't accept deliveries until we approve.
                </div>
              </>
            ) : profile?.verification_status === 'rejected' ? (
              <>
                <div className="text-sm text-ink font-medium">Verification not approved</div>
                {profile.verification_notes && (
                  <div className="text-sm text-slate mt-1">{profile.verification_notes}</div>
                )}
                <Link to="/courier/verify" className="inline-block mt-3 text-signal hover:underline text-sm">
                  Update documents
                </Link>
              </>
            ) : (
              <>
                <div className="text-sm text-ink font-medium">Verify your identity to accept deliveries</div>
                <div className="text-sm text-slate mt-1">
                  We check ID before you can pick up packages for others.
                </div>
                <Link to="/courier/verify" className="inline-block mt-3 text-signal hover:underline text-sm">
                  Start verification
                </Link>
              </>
            )}
          </div>
        )}

        {active.length > 0 && (
          <section className="mt-10">
            <div className="text-xs uppercase tracking-widest text-slate mb-3">
              Your active deliveries
            </div>
            <ul className="space-y-3">
              {active.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/courier/deliveries/${r.id}`}
                    className="block p-5 rounded-xl border border-forest/30 bg-forest/5 hover:border-forest transition-colors"
                  >
                    <div className="space-y-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="text-xs uppercase tracking-wide text-slate whitespace-nowrap">
                          {r.order_number}
                        </div>
                        <div className="text-xs uppercase tracking-wide text-forest whitespace-nowrap">
                          {r.status === 'accepted' ? 'Awaiting pickup' : 'In transit'}
                        </div>
                      </div>
                      <div className="font-serif text-2xl text-ink">{dollars(r.max_price_cents)}</div>
                      <div className="divide-y divide-forest/20">
                        <div className="pb-3">
                          <div className="text-xs uppercase tracking-wide text-slate/70">From</div>
                          <div className="text-sm text-ink mt-1">{r.pickup_address}</div>
                        </div>
                        <div className="py-3">
                          <div className="text-xs uppercase tracking-wide text-slate/70">To</div>
                          <div className="text-sm text-ink mt-1">{r.dropoff_address}</div>
                        </div>
                        {r.package_description && (
                          <div className="py-3">
                            <div className="text-xs uppercase tracking-wide text-slate/70">Description</div>
                            <div className="text-sm text-ink mt-1">{r.package_description}</div>
                          </div>
                        )}
                        {r.pickup_lat != null && r.dropoff_lat != null && (
                          <div className="pt-3">
                            <div className="text-xs uppercase tracking-wide text-slate/70 mb-2">Route</div>
                            <RouteMap
                              pickup={{ lat: r.pickup_lat, lng: r.pickup_lng }}
                              dropoff={{ lat: r.dropoff_lat, lng: r.dropoff_lng }}
                              height={180}
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-3 pt-3 border-t border-forest/20">
                        {r.status === 'accepted' ? (
                          <button
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleAbandon(r)
                            }}
                            disabled={progressing === r.id}
                            className="px-3 py-1 rounded-lg border border-mist text-xs text-slate hover:border-ink hover:text-ink transition-colors disabled:opacity-50"
                          >
                            Abandon
                          </button>
                        ) : (
                          <span />
                        )}
                        {r.status === 'accepted' ? (
                          <button
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handlePickedUp(r)
                            }}
                            disabled={progressing === r.id}
                            className="px-3 py-1 rounded-lg bg-white border border-forest text-forest text-xs font-medium hover:bg-forest hover:text-cream transition-colors disabled:opacity-50"
                          >
                            {progressing === r.id ? 'Saving…' : 'Mark picked up'}
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleDelivered(r)
                            }}
                            disabled={progressing === r.id}
                            className="px-3 py-1 rounded-lg bg-forest text-cream text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                          >
                            {progressing === r.id ? 'Capturing…' : 'Mark delivered'}
                          </button>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {recent.filter((r) => !ratedIds.has(r.id)).length > 0 && (
          <section className="mt-10">
            <div className="text-xs uppercase tracking-widest text-slate mb-3">
              Rate recent deliveries
            </div>
            <ul className="space-y-3">
              {recent
                .filter((r) => !ratedIds.has(r.id))
                .map((r) => (
                  <li key={r.id} className="p-5 rounded-xl border border-mist bg-white space-y-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="text-xs uppercase tracking-wide text-slate whitespace-nowrap">
                        {r.order_number}
                      </div>
                      <div className="text-xs uppercase tracking-wide text-forest whitespace-nowrap">
                        Delivered
                      </div>
                    </div>
                    <div className="font-serif text-2xl text-ink">{dollars(r.max_price_cents)}</div>
                    <div className="text-sm text-slate">
                      <span className="text-slate/70 mr-2">To</span>
                      <span className="text-ink">{r.dropoff_address}</span>
                    </div>
                    <RatingPrompt
                      request={r}
                      raterId={user.id}
                      rateeId={r.sender_id}
                      rateeLabel="sender"
                      onSubmitted={refresh}
                    />
                    <div className="pt-3 border-t border-mist text-right">
                      <Link
                        to={`/courier/deliveries/${r.id}`}
                        className="text-xs text-slate hover:text-ink"
                      >
                        View details &rarr;
                      </Link>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        )}

        <div className="mt-10">
          <div className="text-xs uppercase tracking-widest text-slate mb-3">
            Open in your area
          </div>
          {loading ? (
            <div className="text-slate">Loading…</div>
          ) : !serviceArea ? (
            <div className="text-center py-16 rounded-2xl border border-dashed border-mist">
              <p className="text-slate">Set a service area to see open requests.</p>
              <Link to="/courier/profile" className="inline-block mt-3 text-signal hover:underline">
                Open profile
              </Link>
            </div>
          ) : visibleRequests.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border border-dashed border-mist">
              <p className="text-slate">No open requests in your area right now.</p>
              <p className="text-slate text-sm mt-2">Check back soon.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {visibleRequests.map((r) => {
                const url = photoUrl(r.package_photo_path)
                const canAccept = profile?.verification_status === 'approved'
                const metaParts = [
                  r.distance_miles != null ? `Trip ${r.distance_miles} mi` : null,
                  `${r.miles_from_you.toFixed(1)} mi from you`,
                  r.package_size ? `Size ${r.package_size}` : null,
                ].filter(Boolean)
                return (
                  <li key={r.id} className="p-5 rounded-xl border border-mist bg-white space-y-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="text-xs uppercase tracking-wide text-slate whitespace-nowrap">
                        {r.order_number}
                      </div>
                      <div className="text-xs uppercase tracking-wide text-slate whitespace-nowrap">
                        {timeLabel(r.created_at)}
                      </div>
                    </div>
                    <div className="font-serif text-2xl text-ink">{dollars(r.max_price_cents)}</div>
                    <div className="divide-y divide-mist">
                      <div className="pb-3">
                        <div className="text-xs uppercase tracking-wide text-slate/70">From</div>
                        <div className="text-sm text-ink mt-1">{r.pickup_address}</div>
                      </div>
                      <div className="py-3">
                        <div className="text-xs uppercase tracking-wide text-slate/70">To</div>
                        <div className="text-sm text-ink mt-1">{r.dropoff_address}</div>
                      </div>
                      {r.package_description && (
                        <div className="py-3">
                          <div className="text-xs uppercase tracking-wide text-slate/70">Description</div>
                          <div className="text-sm text-ink mt-1">{r.package_description}</div>
                        </div>
                      )}
                      {url && (
                        <div className="pt-3">
                          <div className="text-xs uppercase tracking-wide text-slate/70">Photo</div>
                          <img
                            src={url}
                            alt={r.package_description || 'Package photo'}
                            className="mt-2 w-full max-h-64 object-cover rounded-lg border border-mist"
                          />
                        </div>
                      )}
                    </div>
                    {metaParts.length > 0 && (
                      <div className="text-xs text-slate flex flex-wrap gap-x-2 gap-y-1">
                        {metaParts.map((part, i) => (
                          <span key={i} className="flex items-center gap-2">
                            {i > 0 && <span className="text-slate/40">·</span>}
                            <span>{part}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-mist">
                      <button
                        onClick={() => handleAccept(r)}
                        disabled={accepting === r.id || !canAccept}
                        title={canAccept ? undefined : 'Complete verification to accept'}
                        className="px-3 py-1 rounded-lg bg-forest text-cream text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {accepting === r.id ? 'Accepting…' : 'Accept'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
