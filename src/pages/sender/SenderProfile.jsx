import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'

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
  const { user, profile } = useAuth()
  const [pmLoading, setPmLoading] = useState(true)
  const [paymentMethods, setPaymentMethods] = useState([])
  const [defaultPmId, setDefaultPmId] = useState(null)
  const [detaching, setDetaching] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [txLoading, setTxLoading] = useState(true)

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

  return (
    <div className="min-h-full">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">
        <div className="flex items-center gap-3">
          <p className="text-xs uppercase tracking-widest text-signal">Sender</p>
          <span className="text-slate/40">·</span>
          <h1 className="font-serif text-4xl text-ink">Profile</h1>
        </div>

        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-slate">Basics</h2>
          <div className="rounded-xl border border-mist bg-white divide-y divide-mist">
            <div className="p-4 flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-wide text-slate/70">Name</span>
              <span className="text-sm text-ink">
                {[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || '—'}
              </span>
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
          <h2 className="text-xs uppercase tracking-widest text-slate">Payment methods</h2>
          {pmLoading ? (
            <div className="text-slate text-sm">Loading…</div>
          ) : paymentMethods.length === 0 ? (
            <div className="rounded-xl border border-dashed border-mist p-6 text-center">
              <p className="text-slate text-sm">No saved cards yet.</p>
              <Link to="/sender/new" className="inline-block mt-3 text-signal hover:underline text-sm">
                Add one when you post a delivery
              </Link>
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
                      <span className="text-xs uppercase tracking-wide text-signal ml-1">Default</span>
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
                              t.status === 'delivered' ? 'text-forest' : 'text-slate/70 line-through'
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
      </div>
    </div>
  )
}
