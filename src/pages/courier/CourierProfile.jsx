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

const VERIFICATION_COPY = {
  approved: { label: 'ID Verification Completed', tone: 'text-forest' },
  pending: { label: 'Under review', tone: 'text-signal' },
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

  const verificationStatus = profile?.verification_status
  const verificationCopy =
    VERIFICATION_COPY[verificationStatus] ?? { label: 'Not started', tone: 'text-slate' }

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
        <div className="flex items-center gap-3">
          <p className="text-xs uppercase tracking-widest text-signal">Courier</p>
          <span className="text-slate/40">·</span>
          <h1 className="font-serif text-4xl text-ink">Profile</h1>
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
                    className="w-full px-3 py-2 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none text-sm"
                  />
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name (optional)"
                    className="w-full px-3 py-2 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none text-sm"
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
                      className="px-3 py-1 rounded-lg bg-ink text-cream text-xs font-medium hover:bg-signal transition-colors disabled:opacity-50"
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
                      className="text-xs text-signal hover:underline"
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
                <div className={`text-sm font-medium ${verificationCopy.tone}`}>
                  {verificationCopy.label}
                </div>
                {verificationStatus === 'rejected' && profile?.verification_notes && (
                  <div className="text-xs text-slate mt-1">{profile.verification_notes}</div>
                )}
                {verificationStatus === 'pending' && (
                  <div className="text-xs text-slate mt-1">
                    We're reviewing your documents.
                  </div>
                )}
                {!verificationStatus && (
                  <div className="text-xs text-slate mt-1">
                    Verify your identity to accept deliveries.
                  </div>
                )}
              </div>
              {(verificationStatus !== 'approved' && verificationStatus !== 'pending') && (
                <Link
                  to="/courier/verify"
                  className="text-xs text-signal hover:underline whitespace-nowrap"
                >
                  {verificationStatus === 'rejected' ? 'Update' : 'Start'}
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
                <span className="font-serif text-2xl text-ink">{dollars(totalEarnedCents)}</span>
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
                                e.status === 'delivered' ? 'text-forest' : 'text-slate/70 line-through'
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
      </div>
    </div>
  )
}
