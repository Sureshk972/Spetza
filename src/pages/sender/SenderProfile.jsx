import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import SenderPaymentSection from '../../components/SenderPaymentSection.jsx'
import ProfileFooterActions from '../../components/ProfileFooterActions.jsx'

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

function CardBrandLabel({ brand }) {
  if (!brand) return <span>Card</span>
  return <span className="capitalize">{brand}</span>
}

export default function SenderProfile() {
  const { user, profile, refreshProfile } = useAuth()
  const [editingName, setEditingName] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [pmLoading, setPmLoading] = useState(true)
  const [paymentMethods, setPaymentMethods] = useState([])
  const [defaultPmId, setDefaultPmId] = useState(null)
  const [detaching, setDetaching] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [txLoading, setTxLoading] = useState(true)
  const [addingCard, setAddingCard] = useState(false)

  const loadPaymentMethods = async () => {
    if (!hasSupabaseConfig || !user) {
      setPmLoading(false)
      return
    }
    setPmLoading(true)
    const { data, error } = await supabase.functions.invoke('list-sender-payment-methods', {
      body: {},
    })
    setPmLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setPaymentMethods(data.payment_methods || [])
    setDefaultPmId(data.default_payment_method_id || null)
  }

  const loadTransactions = async () => {
    if (!hasSupabaseConfig || !user) {
      setTxLoading(false)
      return
    }
    setTxLoading(true)
    const { data } = await supabase
      .from('delivery_requests')
      .select('id, order_number, max_price_cents, status, delivered_at, cancelled_at, created_at, dropoff_address')
      .eq('sender_id', user.id)
      .in('status', ['delivered', 'cancelled'])
      .order('created_at', { ascending: false })
    setTransactions(data || [])
    setTxLoading(false)
  }

  useEffect(() => {
    loadPaymentMethods()
    loadTransactions()
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

  const detach = async (pmId) => {
    if (!confirm('Remove this card from your saved payment methods?')) return
    setDetaching(pmId)
    const { error } = await supabase.functions.invoke('detach-sender-payment-method', {
      body: { payment_method_id: pmId },
    })
    setDetaching(null)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Card removed')
    loadPaymentMethods()
  }

  /* ── How-to journey ── */
  const hasName = !!(profile?.first_name && profile?.last_name)
  const hasPhone = !!profile?.phone_verified_at
  const hasPaymentMethod = paymentMethods.length > 0
  const hasFirstDelivery = transactions.length > 0
  const allSetupDone = hasName && hasPhone && hasPaymentMethod

  const SENDER_SETUP_STEPS = [
    {
      num: '1',
      title: 'Create your account',
      desc: 'Sign up with your name so couriers know who they\'re meeting.',
      done: hasName,
      action: null,
    },
    {
      num: '2',
      title: 'Verify your phone',
      desc: 'We send a 6-digit code to confirm it\'s really you.',
      done: hasPhone,
      action: null,
    },
    {
      num: '3',
      title: 'Add a payment method',
      desc: 'Your card is authorized when a courier accepts — you\'re only charged after delivery.',
      done: hasPaymentMethod,
      action: null,
    },
  ]

  const SENDER_SEND_STEPS = [
    {
      num: '4',
      emoji: '📦',
      title: 'Post your delivery',
      desc: 'Enter pickup and dropoff addresses, describe the package, snap a photo, and post it.',
      done: hasFirstDelivery,
    },
    {
      num: '5',
      emoji: '🔔',
      title: 'A courier accepts',
      desc: 'Nearby couriers see your request. You get a notification the moment someone accepts.',
    },
    {
      num: '6',
      emoji: '🔑',
      title: 'Share your pickup PIN',
      desc: 'When the courier arrives, hand off the package and give them your 4-digit code.',
    },
    {
      num: '7',
      emoji: '✅',
      title: 'Package delivered',
      desc: 'Track status in your inbox. You\'re charged after the courier confirms delivery.',
    },
    {
      num: '8',
      emoji: '⭐',
      title: 'Rate your courier',
      desc: 'Leave a rating and optionally a tip — 100% of tips go directly to the courier.',
    },
  ]

  const setupDoneCount = SENDER_SETUP_STEPS.filter((s) => s.done).length

  return (
    <div className="min-h-full">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">
        <div>
          <h1 className="font-display text-3xl text-ink">Profile</h1>
        </div>

        {/* ── How to send a package ── */}
        <section className="rounded-xl border border-mist bg-white overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <h2 className="text-xs uppercase tracking-widest text-teal font-bold">Your journey</h2>
            <p className="text-xs text-slate mt-1">From sign-up to package delivered.</p>
            <div className="mt-3 h-2 rounded-full bg-mist overflow-hidden">
              <div
                className="h-full rounded-full bg-teal transition-all duration-500"
                style={{ width: `${(setupDoneCount / SENDER_SETUP_STEPS.length) * 100}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs text-slate">
              {allSetupDone
                ? '✅ You\'re ready to send!'
                : `${setupDoneCount} of ${SENDER_SETUP_STEPS.length} setup steps done`}
            </div>
          </div>

          {/* Phase 1: Setup */}
          <div className="px-5 pt-3 pb-1">
            <div className="text-[10px] uppercase tracking-widest text-slate/60 font-bold">Set up your account</div>
          </div>
          <div className="divide-y divide-mist border-t border-mist">
            {SENDER_SETUP_STEPS.map((step) => (
              <div key={step.num} className="px-5 py-3.5 flex items-center gap-3">
                {step.done ? (
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-teal/10 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="text-teal">
                      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 10.7a1 1 0 1 1 1.4-1.4l3.1 3.1 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
                    </svg>
                  </span>
                ) : (
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-mist flex items-center justify-center text-xs font-bold text-slate">
                    {step.num}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink">{step.title}</div>
                  {!step.done && (
                    <div className="text-xs text-slate mt-0.5">{step.desc}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Phase 2: How to send */}
          <div className="px-5 pt-4 pb-1 border-t border-mist">
            <div className="text-[10px] uppercase tracking-widest text-slate/60 font-bold">How to send a package</div>
          </div>
          <div className="divide-y divide-mist border-t border-mist">
            {SENDER_SEND_STEPS.map((step) => (
              <div key={step.num} className="px-5 py-3.5 flex items-center gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-teal/10 flex items-center justify-center text-sm">
                  {step.done
                    ? <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="text-teal">
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
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-widest text-slate">Payment methods</h2>
            {!addingCard && !pmLoading && paymentMethods.length > 0 && (
              <button
                type="button"
                onClick={() => setAddingCard(true)}
                className="text-xs text-teal hover:underline"
              >
                Add card
              </button>
            )}
          </div>
          {addingCard ? (
            <div className="rounded-xl border border-mist bg-white p-4 space-y-3">
              <SenderPaymentSection
                profile={profile}
                onProfileChange={async () => {
                  setAddingCard(false)
                  await refreshProfile()
                  loadPaymentMethods()
                }}
              />
              <button
                type="button"
                onClick={() => setAddingCard(false)}
                className="text-xs text-slate hover:text-ink"
              >
                Cancel
              </button>
            </div>
          ) : pmLoading ? (
            <div className="text-slate text-sm">Loading…</div>
          ) : paymentMethods.length === 0 ? (
            <div className="rounded-xl border border-dashed border-mist p-6 text-center space-y-3">
              <p className="text-slate text-sm">No saved cards yet.</p>
              <button
                type="button"
                onClick={() => setAddingCard(true)}
                className="text-teal hover:underline text-sm"
              >
                Add a card
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-mist bg-white divide-y divide-mist">
              {paymentMethods.map((pm) => (
                <div key={pm.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-baseline gap-2 text-sm text-ink">
                    <CardBrandLabel brand={pm.brand} />
                    <span className="text-slate/70">•••• {pm.last4}</span>
                    {pm.exp_month && pm.exp_year && (
                      <span className="text-xs text-slate/70">
                        exp {String(pm.exp_month).padStart(2, '0')}/{String(pm.exp_year).slice(-2)}
                      </span>
                    )}
                    {defaultPmId === pm.id && (
                      <span className="text-xs uppercase tracking-wide text-teal ml-1">Default</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => detach(pm.id)}
                    disabled={detaching === pm.id}
                    className="text-xs text-slate hover:text-ink transition-colors disabled:opacity-50"
                  >
                    {detaching === pm.id ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-slate">Transactions</h2>
          {txLoading ? (
            <div className="text-slate text-sm">Loading…</div>
          ) : transactions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-mist p-6 text-center">
              <p className="text-slate text-sm">No completed deliveries yet.</p>
            </div>
          ) : (
            <ul className="rounded-xl border border-mist bg-white divide-y divide-mist">
              {transactions.map((t) => {
                const when = t.delivered_at || t.cancelled_at || t.created_at
                return (
                  <li key={t.id}>
                    <Link
                      to={`/sender/requests/${t.id}`}
                      className="block p-4 hover:bg-mist/40 transition-colors"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="text-xs uppercase tracking-wide text-slate">
                          {t.order_number}
                        </div>
                        <div className="text-xs text-slate whitespace-nowrap">{timeLabel(when)}</div>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <div className="text-sm text-ink truncate">{t.dropoff_address}</div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm text-ink">{dollars(t.max_price_cents)}</span>
                          <span
                            className={`text-xs uppercase tracking-wide ${
                              t.status === 'delivered' ? 'text-green' : 'text-slate/70 line-through'
                            }`}
                          >
                            {t.status}
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

        <ProfileFooterActions />
      </div>
    </div>
  )
}
