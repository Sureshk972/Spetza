import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import StatCard from '../../components/admin/StatCard.jsx'
import DataTable from '../../components/admin/DataTable.jsx'

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function dollars(cents) {
  if (!cents) return '$0.00'
  return '$' + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Whole days until evidence is due. Negative once the deadline has passed.
function daysUntil(iso) {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

const RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

export default function AdminPayments() {
  const navigate = useNavigate()
  const [range, setRange] = useState(30)
  const [stats, setStats] = useState({ gmv: 0, fees: 0, count: 0 })
  const [rows, setRows] = useState([])
  const [disputes, setDisputes] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!hasSupabaseConfig) { setLoading(false); return }
    setLoading(true)
    const fromIso = new Date(Date.now() - range * 86400000).toISOString()

    const { data } = await supabase
      .from('delivery_requests')
      .select(`
        id, order_number, status, max_price_cents, platform_fee_cents, accepted_price_cents,
        stripe_payment_intent_id, created_at, delivered_at,
        sender:profiles!delivery_requests_sender_id_fkey(first_name, last_name),
        courier:profiles!delivery_requests_courier_id_fkey(first_name, last_name)
      `)
      .gte('created_at', fromIso)
      .not('stripe_payment_intent_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200)

    const items = data ?? []
    const gmv = items.reduce((s, r) => s + (r.max_price_cents || 0), 0)
    const fees = items.reduce((s, r) => s + (r.platform_fee_cents || 0), 0)
    const processingEst = Math.round(gmv * 0.029 + items.length * 30) // ~2.9% + $0.30

    setStats({ gmv, fees, processingEst, count: items.length, net: fees - processingEst })
    setRows(items)

    // Open disputes always show, however old — one sitting past its deadline
    // is exactly the thing a date filter must not hide.
    const { data: disputeRows } = await supabase
      .from('payment_disputes')
      .select('*')
      .or(`closed_at.is.null,created_at.gte.${fromIso}`)
      .order('closed_at', { ascending: true, nullsFirst: true })
      .order('evidence_due_at', { ascending: true, nullsFirst: false })
      .limit(50)
    setDisputes(disputeRows ?? [])

    setLoading(false)
  }, [range])

  useEffect(() => { load() }, [load])

  const profileName = (p) => p ? [p.first_name, p.last_name].filter(Boolean).join(' ') || '—' : '—'

  const columns = [
    { key: 'created_at', header: 'Date', sortable: true, render: (r) => <span className="text-xs text-slate">{fmtDate(r.created_at)}</span> },
    { key: 'order_number', header: 'Order', render: (r) => <span className="font-medium font-display">{r.order_number}</span> },
    { key: 'sender', header: 'Sender', render: (r) => profileName(r.sender) },
    { key: 'courier', header: 'Courier', render: (r) => profileName(r.courier) },
    { key: 'max_price_cents', header: 'Charged', render: (r) => dollars(r.max_price_cents) },
    { key: 'platform_fee_cents', header: 'Fee', render: (r) => dollars(r.platform_fee_cents) },
    { key: 'status', header: 'Status', render: (r) => <span className="capitalize text-xs">{r.status?.replace('_', ' ')}</span> },
    {
      key: 'stripe', header: 'Stripe',
      render: (r) => r.stripe_payment_intent_id
        ? <a href={`https://dashboard.stripe.com/payments/${r.stripe_payment_intent_id}`} target="_blank" rel="noreferrer" className="text-teal text-xs hover:underline">View ↗</a>
        : '—'
    },
  ]

  return (
    <div>
      <h1 className="font-display text-3xl font-black text-ink">Payments</h1>
      <p className="text-sm text-slate mt-1 mb-6">Revenue and payment activity</p>

      {/* Range toggle */}
      <div className="flex gap-2 mb-6">
        {RANGES.map(r => (
          <button
            key={r.days}
            onClick={() => setRange(r.days)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              range === r.days ? 'bg-teal text-white' : 'bg-mist text-slate hover:text-ink'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Disputes. Rendered above the KPIs because a dispute has a deadline
          and the numbers below do not. Absent entirely when there are none. */}
      {disputes.length > 0 && (
        <div className="mb-8">
          <h2 className="font-display text-lg font-black text-ink mb-1">Disputes</h2>
          <p className="text-sm text-slate mb-3">
            Stripe forfeits the money by default if evidence isn't submitted before the deadline.
          </p>
          <div className="space-y-2">
            {disputes.map((d) => {
              const days = daysUntil(d.evidence_due_at)
              const open = !d.closed_at
              const urgent = open && days !== null && days <= 3
              return (
                <div
                  key={d.id}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 rounded-lg border ${
                    urgent ? 'border-red-300 bg-red-50' : 'border-mist bg-white'
                  }`}
                >
                  <span className="font-display font-black text-ink">{dollars(d.amount_cents)}</span>
                  <span className="text-sm text-slate capitalize">
                    {(d.reason || 'unspecified').replace(/_/g, ' ')}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                    open ? 'bg-amber-100 text-amber-800' : 'bg-mist text-slate'
                  }`}>
                    {d.status?.replace(/_/g, ' ')}
                  </span>
                  {open && days !== null && (
                    <span className={`text-xs font-semibold ${urgent ? 'text-red-700' : 'text-slate'}`}>
                      {days < 0
                        ? `Deadline passed ${Math.abs(days)}d ago`
                        : days === 0
                          ? 'Evidence due today'
                          : `${days}d to respond`}
                    </span>
                  )}
                  <span className="text-xs text-slate ml-auto">{fmtDate(d.opened_at)}</span>
                  {d.delivery_request_id && (
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/deliveries/${d.delivery_request_id}`)}
                      className="text-teal text-xs hover:underline"
                    >
                      Delivery
                    </button>
                  )}
                  {d.stripe_charge_id && (
                    <a
                      href={`https://dashboard.stripe.com/payments/${d.stripe_charge_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-teal text-xs hover:underline"
                    >
                      Stripe ↗
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="GMV" value={dollars(stats.gmv)} hint={`${stats.count} transactions`} />
        <StatCard label="Platform Fees" value={dollars(stats.fees)} />
        <StatCard label="Processing (est.)" value={dollars(stats.processingEst)} hint="~2.9% + $0.30" />
        <StatCard label="Net Revenue" value={dollars(stats.net)} hint="Fees − processing" />
      </div>

      {loading
        ? <div className="text-slate py-8 text-center">Loading…</div>
        : <DataTable
            rows={rows}
            columns={columns}
            onRowClick={(r) => navigate(`/admin/deliveries/${r.id}`)}
            emptyMessage="No payments in this period."
          />
      }
    </div>
  )
}
