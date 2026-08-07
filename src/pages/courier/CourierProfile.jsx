import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import CourierServiceAreaSection from '../../components/CourierServiceAreaSection.jsx'
import CourierConnectSection from '../../components/CourierConnectSection.jsx'
import RatingBadge from '../../components/RatingBadge.jsx'

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
      .select('id, order_number, accepted_price_cents, max_price_cents, platform_fee_cents, status, delivered_at, cancelled_at, accepted_at, dropoff_address')
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

  const totalEarnedCents = earnings
    .filter((e) => e.status === 'delivered')
    .reduce((sum, e) => {
      const gross = e.accepted_price_cents ?? e.max_price_cents ?? 0
      const fee = e.platform_fee_cents ?? 0
      return sum + (gross - fee)
    }, 0)

  return (
    <div className="min-h-full">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">
        <div>
          <div className="text-xs uppercase tracking-widest text-teal">Courier</div>
          <h1 className="font-display text-3xl text-ink mt-1">Profile</h1>
        </div>

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
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-slate">Service area</h2>
          <div className="rounded-xl border border-mist bg-white p-4">
            <CourierServiceAreaSection
              profile={profile}
              onProfileChange={refreshProfile}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-slate">Payouts</h2>
          <div className="rounded-xl border border-mist bg-white p-4">
            <CourierConnectSection profile={profile} />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-slate">Earnings</h2>
          {earningsLoading ? (
            <div className="text-slate text-sm">Loading…</div>
          ) : earnings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-mist p-6 text-center">
              <p className="text-slate text-sm">No completed deliveries yet.</p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-mist bg-white p-4 flex items-baseline justify-between">
                <span className="text-xs uppercase tracking-wide text-slate/70">Total earned</span>
                <span className="font-display text-2xl text-ink">{dollars(totalEarnedCents)}</span>
              </div>
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
                              {e.status === 'delivered' ? dollars(take) : '—'}
                            </span>
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
            </>
          )}
        </section>

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
      </div>
    </div>
  )
}
