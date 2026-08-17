import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import CourierServiceAreaSection from '../../components/CourierServiceAreaSection.jsx'
import CourierConnectSection from '../../components/CourierConnectSection.jsx'
import RatingBadge from '../../components/RatingBadge.jsx'
import EarnBackTracker from '../../components/EarnBackTracker.jsx'

function dollars(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

function timeLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const BG_LABEL = {
  not_started: { label: 'Not started', tone: 'text-slate' },
  pending: { label: 'In progress', tone: 'text-teal' },
  consider: { label: 'Under review', tone: 'text-teal' },
  clear: { label: 'Verified ✓', tone: 'text-green' },
  rejected: { label: 'Not approved', tone: 'text-red-600' },
}

export default function CourierProfile() {
  const { user, profile, refreshProfile } = useAuth()
  const [editingName, setEditingName] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [earnings, setEarnings] = useState([])
  const [earningsLoading, setEarningsLoading] = useState(true)

  const loadEarnings = async () => {
    if (!hasSupabaseConfig || !user) {
      setEarningsLoading(false)
      return
    }
    setEarningsLoading(true)
    const { data } = await supabase
      .from('delivery_requests')
      .select('id, order_number, accepted_price_cents, max_price_cents, platform_fee_cents, tip_cents, status, delivered_at, cancelled_at, accepted_at, dropoff_address')
      .eq('courier_id', user.id)
      .in('status', ['delivered', 'cancelled'])
      .order('accepted_at', { ascending: false })
    setEarnings(data || [])
    setEarningsLoading(false)
  }

  useEffect(() => {
    loadEarnings()
  }, [user])

  const startEditName = () => {
    setFirstName(profile?.first_name || '')
    setLastName(profile?.last_name || '')
    setEditingName(true)
  }

  const saveName = async () => {
    const cleaned = firstName.trim()
    if (!cleaned) {
      toast.error('First name is required.')
      return
    }
    setSavingName(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: cleaned,
        last_name: lastName.trim() || null,
      })
      .eq('id', user.id)
    setSavingName(false)
    if (error) {
      toast.error(error.message)
      return
    }
    await refreshProfile()
    setEditingName(false)
    toast.success('Name updated')
  }

  const bgStatus = profile?.background_check_status ?? 'not_started'
  const bgCopy = BG_LABEL[bgStatus] ?? BG_LABEL.not_started

  const delivered = earnings.filter((e) => e.status === 'delivered')
  const totalEarnedCents = delivered.reduce((sum, e) => {
    const gross = e.accepted_price_cents ?? e.max_price_cents ?? 0
    const fee = e.platform_fee_cents ?? 0
    return sum + (gross - fee)
  }, 0)
  const totalTipsCents = delivered.reduce((sum, e) => sum + (e.tip_cents || 0), 0)

  /* ── Onboarding step statuses ── */
  const hasName = !!(profile?.first_name && profile?.last_name)
  const hasSelfie = !!profile?.selfie_path
  const payoutsReady =
    profile?.stripe_connect_charges_enabled && profile?.stripe_connect_payouts_enabled
  const bgCleared = bgStatus === 'clear'
  const bgInProgress = bgStatus === 'pending' || bgStatus === 'consider'
  const hasServiceArea = !!(profile?.home_lat && profile?.service_radius_miles)
  const allDone = hasName && hasSelfie && payoutsReady && bgCleared && hasServiceArea

  const hasFirstDelivery = delivered.length > 0

  const SETUP_STEPS = [
    {
      num: '1',
      title: 'Add your name',
      desc: 'First and last name — senders see your first name when you accept.',
      done: hasName,
      action: null,
    },
    {
      num: '2',
      title: 'Upload a selfie',
      desc: 'A clear photo so senders know who to expect at the door.',
      done: hasSelfie,
      action: '/courier/verify',
    },
    {
      num: '3',
      title: 'Set up Stripe payouts',
      desc: 'Connect your bank account through Stripe so you get paid after every delivery.',
      done: payoutsReady,
      action: null,
    },
    {
      num: '4',
      title: 'Checkr background check',
      desc: 'One-time $40 screening by Checkr — earn it back at $1 per delivery.',
      done: bgCleared,
      inProgress: bgInProgress,
      action: '/courier/verify',
    },
    {
      num: '5',
      title: 'Set your service area',
      desc: 'Tell us where you deliver so we show you nearby requests.',
      done: hasServiceArea,
      action: null,
    },
  ]

  const EARNING_STEPS = [
    {
      num: '6',
      emoji: '📦',
      title: 'Accept a delivery',
      desc: 'Open requests appear on your Discover tab. Tap Accept on any that fit your route.',
      done: hasFirstDelivery,
    },
    {
      num: '7',
      emoji: '🔑',
      title: 'Pick up the package',
      desc: 'Head to the pickup address. The sender gives you a 4-digit PIN to confirm the handoff.',
    },
    {
      num: '8',
      emoji: '🚗',
      title: 'Deliver it',
      desc: 'Drive to the drop-off address and mark the delivery as complete.',
    },
    {
      num: '9',
      emoji: '💰',
      title: 'Get paid via Stripe',
      desc: 'Earnings hit your bank account the next business day. Tips are instant.',
    },
  ]

  const setupDoneCount = SETUP_STEPS.filter((s) => s.done).length
  const totalSteps = SETUP_STEPS.length + EARNING_STEPS.length

  return (
    <div className="min-h-full">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">
        <div>
          <div className="text-xs uppercase tracking-widest text-teal">Courier</div>
          <h1 className="font-display text-3xl text-ink mt-1">Profile</h1>
        </div>

        {/* ── Onboarding: full journey ── */}
        <section className="rounded-xl border border-mist bg-white overflow-hidden">
          {/* Header + progress */}
          <div className="px-5 pt-5 pb-4">
            <h2 className="text-xs uppercase tracking-widest text-teal font-bold">Your journey</h2>
            <p className="text-xs text-slate mt-1">From sign-up to money in your bank.</p>
            {/* Progress bar — tracks setup steps */}
            <div className="mt-3 h-2 rounded-full bg-mist overflow-hidden">
              <div
                className="h-full rounded-full bg-green transition-all duration-500"
                style={{ width: `${(setupDoneCount / SETUP_STEPS.length) * 100}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs text-slate">
              {allDone
                ? '✅ Setup complete — you\'re earning!'
                : `${setupDoneCount} of ${SETUP_STEPS.length} setup steps done`}
            </div>
          </div>

          {/* Phase 1: Setup */}
          <div className="px-5 pt-3 pb-1">
            <div className="text-[10px] uppercase tracking-widest text-slate/60 font-bold">Set up your account</div>
          </div>
          <div className="divide-y divide-mist border-t border-mist">
            {SETUP_STEPS.map((step) => (
              <div key={step.num} className="px-5 py-3.5 flex items-center gap-3">
                {step.done ? (
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-green/10 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="text-green">
                      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 10.7a1 1 0 1 1 1.4-1.4l3.1 3.1 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
                    </svg>
                  </span>
                ) : step.inProgress ? (
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-teal/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-teal">⏳</span>
                  </span>
                ) : (
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-mist flex items-center justify-center text-xs font-bold text-slate">
                    {step.num}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink">
                    {step.title}
                  </div>
                  {!step.done && (
                    <div className="text-xs text-slate mt-0.5">{step.desc}</div>
                  )}
                </div>
                {!step.done && !step.inProgress && step.action && (
                  <Link to={step.action} className="text-xs text-teal font-medium hover:underline whitespace-nowrap">
                    Set up →
                  </Link>
                )}
                {step.inProgress && (
                  <span className="text-xs text-teal font-medium whitespace-nowrap">In progress</span>
                )}
              </div>
            ))}
          </div>

          {/* Phase 2: How you earn */}
          <div className="px-5 pt-4 pb-1 border-t border-mist">
            <div className="text-[10px] uppercase tracking-widest text-slate/60 font-bold">How you earn</div>
          </div>
          <div className="divide-y divide-mist border-t border-mist">
            {EARNING_STEPS.map((step) => (
              <div key={step.num} className="px-5 py-3.5 flex items-center gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-green/10 flex items-center justify-center text-sm">
                  {step.done
                    ? <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="text-green">
                        <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 10.7a1 1 0 1 1 1.4-1.4l3.1 3.1 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
                      </svg>
                    : step.emoji}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink">{step.title}</div>
                  <div className="text-xs text-slate mt-0.5">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Earnings summary — front and center for money-focused cockpit ── */}
        {!earningsLoading && delivered.length > 0 && (
          <section className="rounded-xl border border-green/20 bg-green/5 p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-ink">Total earned</span>
              <span className="font-display text-3xl text-green">{dollars(totalEarnedCents + totalTipsCents)}</span>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-slate">
              <span>{delivered.length} deliveries</span>
              {totalTipsCents > 0 && (
                <>
                  <span className="text-slate/40">·</span>
                  <span>{dollars(totalTipsCents)} in tips</span>
                </>
              )}
            </div>
          </section>
        )}

        {/* ── Basics ── */}
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-slate">Basics</h2>
          <div className="rounded-xl border border-mist bg-white divide-y divide-mist">
            <div className="p-4">
              {editingName ? (
                <div className="space-y-3">
                  <div className="text-xs uppercase tracking-wide text-slate/70">Name</div>
                  <input
                    type="text"
                    autoFocus
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    className="w-full px-3 py-2 rounded-lg bg-mist border border-mist focus:border-teal focus:outline-none text-sm"
                  />
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name (optional)"
                    className="w-full px-3 py-2 rounded-lg bg-mist border border-mist focus:border-teal focus:outline-none text-sm"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setEditingName(false)}
                      disabled={savingName}
                      className="px-3 py-1 rounded-lg text-xs text-slate hover:text-ink transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveName}
                      disabled={savingName}
                      className="px-3 py-1 rounded-lg bg-ink text-white text-xs font-medium hover:bg-teal-light transition-colors disabled:opacity-50"
                    >
                      {savingName ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-wide text-slate/70">Name</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-ink">
                      {[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || '—'}
                    </span>
                    <button
                      type="button"
                      onClick={startEditName}
                      className="text-xs text-teal hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-wide text-slate/70">Email</span>
              <span className="text-sm text-ink">{user?.email || '—'}</span>
            </div>
            <div className="p-4 flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-wide text-slate/70">Phone</span>
              <span className="text-sm text-ink">{profile?.phone_number || '—'}</span>
            </div>
            <div className="p-4 flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-wide text-slate/70">Rating</span>
              <RatingBadge avg={profile?.rating_avg} count={profile?.rating_count} />
            </div>
          </div>
        </section>

        {/* ── Verification ── */}
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-slate">Verification</h2>
          <div className="rounded-xl border border-mist bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className={`text-sm font-medium ${bgCopy.tone}`}>
                  {bgCopy.label}
                </div>
                {bgStatus === 'pending' && (
                  <div className="text-xs text-slate mt-1">
                    Your background check is in progress.
                  </div>
                )}
                {bgStatus === 'consider' && (
                  <div className="text-xs text-slate mt-1">
                    Your background check is under review.
                  </div>
                )}
                {bgStatus === 'rejected' && (
                  <div className="text-xs text-slate mt-1">
                    Check your email from Checkr for details.
                  </div>
                )}
                {bgStatus === 'not_started' && (
                  <div className="text-xs text-slate mt-1">
                    Get verified to accept deliveries.
                  </div>
                )}
              </div>
              {bgStatus !== 'clear' && bgStatus !== 'pending' && bgStatus !== 'consider' && (
                <Link
                  to="/courier/verify"
                  className="text-xs text-teal hover:underline whitespace-nowrap"
                >
                  {bgStatus === 'rejected' ? 'Details' : 'Start'}
                </Link>
              )}
            </div>
            {bgStatus !== 'rejected' && (
              <EarnBackTracker creditedCents={profile?.earnback_credited_cents ?? 0} variant="profile" />
            )}
          </div>
        </section>

        {/* ── Service area ── */}
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-slate">Service area</h2>
          <div className="rounded-xl border border-mist bg-white p-4">
            <CourierServiceAreaSection
              profile={profile}
              onProfileChange={refreshProfile}
            />
          </div>
        </section>

        {/* ── Payouts ── */}
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-slate">Payouts</h2>
          <div className="rounded-xl border border-mist bg-white p-4">
            <CourierConnectSection profile={profile} />
          </div>
        </section>

        {/* ── Earnings history ── */}
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-slate">Delivery history</h2>
          {earningsLoading ? (
            <div className="text-slate text-sm">Loading…</div>
          ) : earnings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-mist p-6 text-center">
              <p className="text-slate text-sm">No completed deliveries yet.</p>
            </div>
          ) : (
            <ul className="rounded-xl border border-mist bg-white divide-y divide-mist">
              {earnings.map((e) => {
                const gross = e.accepted_price_cents ?? e.max_price_cents ?? 0
                const fee = e.platform_fee_cents ?? 0
                const take = e.status === 'delivered' ? gross - fee : 0
                const when = e.delivered_at || e.cancelled_at || e.accepted_at
                return (
                  <li key={e.id}>
                    <Link
                      to={`/courier/deliveries/${e.id}`}
                      className="block p-4 hover:bg-mist/40 transition-colors"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="text-xs uppercase tracking-wide text-slate">
                          {e.order_number}
                        </div>
                        <div className="text-xs text-slate whitespace-nowrap">{timeLabel(when)}</div>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <div className="text-sm text-ink truncate">{e.dropoff_address}</div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm text-ink">
                            {e.status === 'delivered' ? dollars(take + (e.tip_cents || 0)) : '—'}
                          </span>
                          {e.tip_cents > 0 && (
                            <span className="text-xs text-green">+tip</span>
                          )}
                          <span
                            className={`text-xs uppercase tracking-wide ${
                              e.status === 'delivered' ? 'text-green' : 'text-slate/70 line-through'
                            }`}
                          >
                            {e.status}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* ── Support ── */}
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-slate">Support</h2>
          <div className="rounded-xl border border-mist bg-white p-4">
            <a
              href="mailto:contact@spetza.com"
              className="flex items-center gap-3 text-sm text-teal hover:underline"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              Contact Support
            </a>
          </div>
        </section>

        {/* Legal */}
        <div className="mt-6 flex justify-center gap-3 text-[11px] text-slate/60 pb-4">
          <Link to="/privacy" className="hover:text-ink transition-colors">Privacy Policy</Link>
          <span>·</span>
          <Link to="/terms" className="hover:text-ink transition-colors">Terms of Service</Link>
          <span>·</span>
          <Link to="/trust" className="hover:text-ink transition-colors">Trust &amp; Safety</Link>
        </div>
      </div>
    </div>
  )
}
