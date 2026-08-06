import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import DataTable from '../../components/admin/DataTable.jsx'

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function dollars(cents) {
  if (!cents) return '—'
  return '$' + (cents / 100).toFixed(2)
}

const STATUS_STYLE = {
  open: 'bg-teal/10 text-teal',
  accepted: 'bg-teal/10 text-teal',
  picked_up: 'bg-teal/10 text-teal',
  delivered: 'bg-green/10 text-green',
  cancelled: 'bg-red-100 text-red-500',
}

export default function AdminDeliveries() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')

  const load = useCallback(async () => {
    if (!hasSupabaseConfig) { setLoading(false); return }
    setLoading(true)
    let q = supabase
      .from('delivery_requests')
      .select(`
        id, order_number, status, max_price_cents, platform_fee_cents, accepted_price_cents,
        distance_miles, package_size, created_at, delivered_at,
        sender:profiles!delivery_requests_sender_id_fkey(first_name, last_name),
        courier:profiles!delivery_requests_courier_id_fkey(first_name, last_name)
      `)
      .order('created_at', { ascending: false })
      .limit(200)

    if (statusFilter !== 'all') q = q.eq('status', statusFilter)

    const { data } = await q
    setRows(data ?? [])
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  const profileName = (p) => p ? [p.first_name, p.last_name].filter(Boolean).join(' ') || '—' : '—'

  const columns = [
    { key: 'order_number', header: 'Order', sortable: true, render: (r) => <span className="font-medium font-display">{r.order_number}</span> },
    { key: 'created_at', header: 'Created', sortable: true, render: (r) => <span className="text-xs text-slate">{fmtDate(r.created_at)}</span> },
    { key: 'sender', header: 'Sender', render: (r) => profileName(r.sender) },
    { key: 'courier', header: 'Courier', render: (r) => profileName(r.courier) },
    {
      key: 'status', header: 'Status', sortable: true,
      render: (r) => (
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLE[r.status] ?? 'text-slate'}`}>
          {r.status?.replace('_', ' ')}
        </span>
      )
    },
    { key: 'max_price_cents', header: 'Price', render: (r) => dollars(r.max_price_cents) },
    { key: 'distance_miles', header: 'Distance', render: (r) => r.distance_miles ? `${Number(r.distance_miles).toFixed(1)} mi` : '—' },
  ]

  return (
    <div>
      <h1 className="font-display text-3xl font-black text-ink">Deliveries</h1>
      <p className="text-sm text-slate mt-1 mb-6">All delivery requests across the platform</p>

      <div className="flex gap-3 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-mist border border-mist focus:border-teal focus:outline-none text-sm"
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="accepted">Accepted</option>
          <option value="picked_up">Picked up</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading
        ? <div className="text-slate py-8 text-center">Loading…</div>
        : <DataTable
            rows={rows}
            columns={columns}
            onRowClick={(r) => navigate(`/admin/deliveries/${r.id}`)}
            emptyMessage="No deliveries yet."
          />
      }
    </div>
  )
}
