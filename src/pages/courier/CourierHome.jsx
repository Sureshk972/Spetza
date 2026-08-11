import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { haversineMiles } from '../../lib/geocode.js'
import RouteMap from '../../components/RouteMap.jsx'
import RatingPrompt from '../../components/RatingPrompt.jsx'
import RatingBadge from '../../components/RatingBadge.jsx'
import PackagePhoto from '../../components/PackagePhoto.jsx'
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh.js'
import { canAcceptDeliveries, courierStep } from '../../lib/courierGate.js'
import PricingTable from '../../components/PricingTable.jsx'

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

const ACCEPT_ERROR_COPY = {
  'add a selfie first': 'Add a selfie before you can accept.',
  'background check not clear': "Your background check isn't clear yet.",
  'courier payouts not set up':
    "You cannot accept this order because you haven't set up your payouts yet. Open Profile → Payouts to connect a bank account.",
  'request not available': 'This request was just taken by another courier.',
  'cannot accept your own request': "You can't accept your own request.",
  'sender has no payment method on file':
    "The sender hasn't saved a payment method yet.",
}

async function readInvokeErrorCode(error) {
  try {
    const body = await error?.context?.json?.()
    return body?.error ?? null
  } catch {
    return null
  }
}

export default function CourierHome() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [active, setActive] = useState([])
  const [recent, setRecent] = useState([])
  const [allDelivered, setAllDelivered] = useState([])
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
            .select('id, sender_id, order_number, dropoff_address, max_price_cents, accepted_price_cents, platform_fee_cents, tip_cents, delivered_at, status')
            .eq('courier_id', user.id)
            .eq('status', 'delivered')
            .order('delivered_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      user
        ? supabase
            .from('ratings')
            .select('delivery_request_id')
            .eq('rater_id', user.id)
        : Promise.resolve({ data: [] }),
    ]).then(([openRes, activeRes, deliveredRes, ratedRes]) => {
      setRequests(openRes.data ?? [])
      setActive(activeRes.data ?? [])
      const delivered = deliveredRes.data ?? []
      setAllDelivered(delivered)
      setRecent(delivered.slice(0, 5))
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

  // Earnings stats
  const earnings = useMemo(() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString()

    let todayEarn = 0, weekEarn = 0, totalEarn = 0, totalTips = 0
    for (const d of allDelivered) {
      const net = (d.accepted_price_cents || d.max_price_cents || 0) - (d.platform_fee_cents || 0)
      const tip = d.tip_cents || 0
      totalEarn += net
      totalTips += tip
      if (d.delivered_at >= todayStart) todayEarn += net + tip
      if (d.delivered_at >= weekStart) weekEarn += net + tip
    }
    return {
      today: todayEarn,
      week: weekEarn,
      total: totalEarn,
      tips: totalTips,
      count: allDelivered.length,
    }
  }, [allDelivered])

  // Total open orders (all, not just in service area) — motivator
  const totalOpen = requests.length

  const { visibleRequests, newestId } = useMemo(() => {
    if (!serviceArea) return { visibleRequests: [], newestId: null }
    const list = requests
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
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    return { visibleRequests: list, newestId: list[0]?.id ?? null }
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
      const code = await readInvokeErrorCode(error)
      toast.error(ACCEPT_ERROR_COPY[code] || 'Something went wrong. Try again.')
      return
    }
    navigate(`/courier/deliveries/${request.id}`)
  }

  const handleDelivered = async (request) => {
    const take = (request.accepted_price_cents ?? request.max_price_cents) - (request.platform_fee_cents ?? 0)
    const ok = window.confirm(
      `Confirm delivered? You'll earn ${dollars(take)}.`,
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
          <div className="text-xs uppercase tracking-widest text-teal">Courier</div>
          <h1 className="font-display text-3xl text-ink mt-1">Discover</h1>
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

        {/* Stats cards */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl border border-mist bg-white">
            <div className="text-xs uppercase tracking-widest text-slate">Today</div>
            <div className="font-display text-2xl text-ink mt-1">{dollars(earnings.today)}</div>
          </div>
          <div className="p-4 rounded-xl border border-mist bg-white">
            <div className="text-xs uppercase tracking-widest text-slate">This week</div>
            <div className="font-display text-2xl text-ink mt-1">{dollars(earnings.week)}</div>
          </div>
          <div className="p-4 rounded-xl border border-mist bg-white">
            <div className="text-xs uppercase tracking-widest text-slate">All-time earnings</div>
            <div className="font-display text-2xl text-green mt-1">{dollars(earnings.total)}</div>
            {earnings.tips > 0 && (
              <div className="text-xs text-slate mt-0.5">+ {dollars(earnings.tips)} tips</div>
            )}
          </div>
          <div className="p-4 rounded-xl border border-mist bg-white">
            <div className="text-xs uppercase tracking-widest text-slate">Completed</div>
            <div className="font-display text-2xl text-ink mt-1">{earnings.count}</div>
            {totalOpen > 0 && (
              <div className="text-xs text-teal font-medium mt-0.5">
                {totalOpen} open now
              </div>
            )}
          </div>
        </div>

        {/* How it works — show for new couriers */}
        {earnings.count === 0 && courierStep(profile) === 'done' && (
          <section className="mt-6 p-5 rounded-xl border border-mist bg-white">
            <div className="text-sm font-medium text-ink mb-3">How it works</div>
            <ol className="space-y-3">
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-teal/10 text-teal text-xs font-bold flex items-center justify-center">1</span>
                <div>
                  <div className="text-sm text-ink font-medium">Browse open requests</div>
                  <div className="text-xs text-slate">See deliveries near you with pickup and drop-off addresses, distance, and price.</div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-teal/10 text-teal text-xs font-bold flex items-center justify-center">2</span>
                <div>
                  <div className="text-sm text-ink font-medium">Accept and pick up</div>
                  <div className="text-xs text-slate">Tap Accept, head to the pickup spot, and enter the sender's 4-digit PIN to confirm the handoff.</div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-teal/10 text-teal text-xs font-bold flex items-center justify-center">3</span>
                <div>
                  <div className="text-sm text-ink font-medium">Deliver and get paid</div>
                  <div className="text-xs text-slate">Drop off the package, mark it delivered, and your earnings hit your bank account automatically.</div>
                </div>
              </li>
            </ol>
          </section>
        )}

        {courierStep(profile) !== 'done' && (
          <div className="mt-8 p-4 rounded-xl border border-teal/40 bg-teal/5">
            <div className="text-sm text-ink font-medium">Finish getting verified to accept deliveries</div>
            <div className="text-sm text-slate mt-1">
              {courierStep(profile) === 'selfie' && 'Upload a selfie to continue.'}
              {courierStep(profile) === 'payouts' && 'Set up your payout account to get paid.'}
              {courierStep(profile) === 'background' &&
                (profile?.background_check_status === 'pending'
                  ? "Your background check is in progress. We'll update this when it's done."
                  : profile?.background_check_status === 'consider'
                  ? 'Your background check is under review.'
                  : profile?.background_check_status === 'rejected'
                  ? 'Your background check was not approved.'
                  : 'Start your background check.')}
            </div>
            <Link to="/courier/verify" className="inline-block mt-3 text-teal hover:underline text-sm">
              Continue verification
            </Link>
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
                    className="block p-5 rounded-xl border border-green/30 bg-green/5 hover:border-green transition-colors"
                  >
                    <div className="space-y-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="text-xs uppercase tracking-wide text-slate whitespace-nowrap">
                          {r.order_number}
                        </div>
                        <div className="text-xs uppercase tracking-wide text-green whitespace-nowrap">
                          {r.status === 'accepted' ? 'Awaiting pickup' : 'In transit'}
                        </div>
                      </div>
                      <div className="font-display text-2xl text-ink">{dollars(r.max_price_cents)}</div>
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
                      <div className="flex items-center justify-between gap-3 pt-3 border-t border-green/20">
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
                          <span className={`px-3 py-1 rounded-lg text-xs font-medium ${
                            r.courier_arrived_at
                              ? 'bg-green/10 border border-green/30 text-green'
                              : 'bg-teal/10 border border-teal/30 text-teal'
                          }`}>
                            {r.courier_arrived_at ? '🔑 Enter PIN →' : '📍 Head to pickup →'}
                          </span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleDelivered(r)
                            }}
                            disabled={progressing === r.id}
                            className="px-3 py-1 rounded-lg bg-green text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
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
                      <div className="text-xs uppercase tracking-wide text-green whitespace-nowrap">
                        Delivered
                      </div>
                    </div>
                    <div className="font-display text-2xl text-ink">{dollars(r.max_price_cents)}</div>
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

        <div className="mt-6">
          <PricingTable variant="courier" collapsible />
        </div>

        <div id="open-requests" className="mt-10">
          <div className="text-xs uppercase tracking-widest text-slate mb-3 flex items-center gap-2">
            Open in your area
            {visibleRequests.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-green text-white text-[10px] font-bold">
                {visibleRequests.length}
              </span>
            )}
          </div>
          {loading ? (
            <div className="text-slate">Loading…</div>
          ) : !serviceArea ? (
            <div className="text-center py-16 rounded-2xl border border-dashed border-mist">
              <p className="text-slate">Set a service area to see open requests.</p>
              <Link to="/courier/profile" className="inline-block mt-3 text-teal hover:underline">
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
                const canAccept = canAcceptDeliveries(profile)
                const disabledReason = canAccept
                  ? undefined
                  : courierStep(profile) === 'selfie'
                  ? 'Add a selfie to accept'
                  : courierStep(profile) === 'payouts'
                  ? 'Connect a bank account to accept'
                  : 'Finish your background check to accept'
                const metaParts = [
                  r.distance_miles != null ? `Trip ${r.distance_miles} mi` : null,
                  `${r.miles_from_you.toFixed(1)} mi from you`,
                  r.package_size ? `Size ${r.package_size}` : null,
                ].filter(Boolean)
                return (
                  <li key={r.id} className="p-5 rounded-xl border border-mist bg-white space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase tracking-wide text-slate whitespace-nowrap">
                          {r.order_number}
                        </span>
                        {r.id === newestId ? (
                          <span className="px-1.5 py-0.5 rounded-full bg-green text-white text-[10px] font-bold uppercase tracking-wide">
                            New
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-full bg-teal/10 text-teal text-[10px] font-bold uppercase tracking-wide">
                            Open
                          </span>
                        )}
                      </div>
                      <div className="text-xs uppercase tracking-wide text-slate whitespace-nowrap">
                        {timeLabel(r.created_at)}
                      </div>
                    </div>
                    <div className="font-display text-2xl text-ink">{dollars(r.max_price_cents)}</div>
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
                      <PackagePhoto path={r.package_photo_path} alt={r.package_description || 'Package photo'} />
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
                        title={disabledReason}
                        className="px-3 py-1 rounded-lg bg-green text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
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
