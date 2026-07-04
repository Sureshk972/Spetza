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
    <div className="min-h-full px-6 py-12 max-w-3xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-forest">Courier</div>
          <h1 className="font-serif text-3xl text-ink mt-1">Open requests</h1>
          <div className="mt-1">
            <RatingBadge avg={profile?.rating_avg} count={profile?.rating_count} />
          </div>
          {serviceArea && (
            <div className="text-xs text-slate mt-1">
              Within {serviceArea.radius} mi of your home
            </div>
          )}
        </div>
        <Link to="/settings" className="text-sm text-slate hover:text-ink">Settings</Link>
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
              <li key={r.id} className="p-5 rounded-xl border border-forest/20 bg-forest/5">
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-slate">
                      <span>{r.order_number}</span>
                      <span className="text-slate/50">•</span>
                      <span className="text-forest">
                        {r.status === 'accepted' ? 'Awaiting pickup' : 'In transit'}
                      </span>
                    </div>
                    <div className="space-y-0.5 text-sm">
                      <div className="text-slate">
                        <span className="text-slate/70 mr-2">From</span>
                        <span className="text-ink">{r.pickup_address}</span>
                      </div>
                      <div className="text-slate">
                        <span className="text-slate/70 mr-2">To</span>
                        <span className="text-ink">{r.dropoff_address}</span>
                      </div>
                    </div>
                    <div className="text-slate text-sm">{r.package_description}</div>
                    {r.pickup_lat != null && r.dropoff_lat != null && (
                      <div className="pt-2">
                        <RouteMap
                          pickup={{ lat: r.pickup_lat, lng: r.pickup_lng }}
                          dropoff={{ lat: r.dropoff_lat, lng: r.dropoff_lng }}
                          height={180}
                        />
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-2">
                    <div className="font-serif text-xl text-ink">{dollars(r.max_price_cents)}</div>
                    {r.status === 'accepted' ? (
                      <>
                        <button
                          onClick={() => handlePickedUp(r)}
                          disabled={progressing === r.id}
                          className="px-3 py-1 rounded-lg bg-white border border-forest text-forest text-xs font-medium hover:bg-forest hover:text-cream transition-colors disabled:opacity-50"
                        >
                          {progressing === r.id ? 'Saving…' : 'Mark picked up'}
                        </button>
                        <div>
                          <button
                            onClick={() => handleAbandon(r)}
                            disabled={progressing === r.id}
                            className="px-2 py-0.5 rounded-lg text-xs text-slate hover:text-ink transition-colors disabled:opacity-50"
                          >
                            Abandon
                          </button>
                        </div>
                      </>
                    ) : (
                      <button
                        onClick={() => handleDelivered(r)}
                        disabled={progressing === r.id}
                        className="px-3 py-1 rounded-lg bg-forest text-cream text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {progressing === r.id ? 'Capturing…' : 'Mark delivered'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-forest/20 text-right">
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

      {recent.filter((r) => !ratedIds.has(r.id)).length > 0 && (
        <section className="mt-10">
          <div className="text-xs uppercase tracking-widest text-slate mb-3">
            Rate recent deliveries
          </div>
          <ul className="space-y-3">
            {recent
              .filter((r) => !ratedIds.has(r.id))
              .map((r) => (
                <li key={r.id} className="p-5 rounded-xl border border-mist bg-white">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="text-xs uppercase tracking-widest text-slate">
                        {r.order_number}
                      </div>
                      <div className="text-sm text-slate">
                        <span className="text-slate/70 mr-2">To</span>
                        <span className="text-ink">{r.dropoff_address}</span>
                      </div>
                    </div>
                    <div className="font-serif text-xl text-ink">{dollars(r.max_price_cents)}</div>
                  </div>
                  <RatingPrompt
                    request={r}
                    raterId={user.id}
                    rateeId={r.sender_id}
                    rateeLabel="sender"
                    onSubmitted={refresh}
                  />
                  <div className="mt-3 pt-3 border-t border-mist text-right">
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
        {loading ? (
          <div className="text-slate">Loading…</div>
        ) : !serviceArea ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-mist">
            <p className="text-slate">Set a service area to see open requests.</p>
            <Link to="/settings" className="inline-block mt-3 text-signal hover:underline">
              Open settings
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
              return (
                <li key={r.id} className="p-5 rounded-xl border border-mist bg-white">
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-slate">
                        <span>{r.order_number}</span>
                        <span className="text-slate/50">•</span>
                        <span>{timeLabel(r.created_at)}</span>
                      </div>
                      <div className="space-y-0.5 text-sm">
                        <div className="text-slate">
                          <span className="text-slate/70 mr-2">From</span>
                          <span className="text-ink">{r.pickup_address}</span>
                        </div>
                        <div className="text-slate">
                          <span className="text-slate/70 mr-2">To</span>
                          <span className="text-ink">{r.dropoff_address}</span>
                        </div>
                      </div>
                      <div className="text-slate text-sm">{r.package_description}</div>
                      <div className="text-xs text-slate">
                        {r.distance_miles != null && (
                          <span>Trip: <span className="text-ink">{r.distance_miles} mi</span></span>
                        )}
                        <span className="ml-3">
                          Pickup is <span className="text-ink">{r.miles_from_you.toFixed(1)} mi</span> from you
                        </span>
                        {r.package_size && (
                          <span className="ml-3">Size: <span className="text-ink">{r.package_size}</span></span>
                        )}
                      </div>
                    </div>
                    {url && (
                      <img
                        src={url}
                        alt="Package"
                        className="w-20 h-20 object-cover rounded-lg border border-mist shrink-0"
                      />
                    )}
                    <div className="text-right shrink-0">
                      <div className="font-serif text-xl text-ink">{dollars(r.max_price_cents)}</div>
                      <button
                        onClick={() => handleAccept(r)}
                        disabled={
                          accepting === r.id ||
                          profile?.verification_status !== 'approved'
                        }
                        className="mt-2 px-3 py-1 rounded-lg bg-forest text-cream text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {accepting === r.id ? 'Accepting…' : 'Accept'}
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
