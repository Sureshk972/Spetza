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
