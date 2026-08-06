import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import DataTable from '../../components/admin/DataTable.jsx'

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminUsers() {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const load = useCallback(async () => {
    if (!hasSupabaseConfig) { setLoading(false); return }
    setLoading(true)
    let q = supabase
      .from('profiles')
      .select('id, first_name, last_name, account_type, is_admin, is_suspended, created_at, rating_avg, rating_count, is_phone_verified, background_check_status')
      .order('created_at', { ascending: false })
      .limit(200)

    if (typeFilter !== 'all') q = q.eq('account_type', typeFilter)
    if (search.trim()) {
      const s = search.trim().replace(/[%_]/g, '')
      q = q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%`)
    }

    const { data } = await q
    setUsers(data ?? [])
    setLoading(false)
  }, [search, typeFilter])

  useEffect(() => { load() }, [load])

  const columns = [
    {
      key: 'name', header: 'Name', sortable: true,
      render: (r) => {
        const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unnamed'
        return (
          <span className="font-medium">
            {name}
            {r.is_admin && <span className="ml-2 text-[10px] uppercase tracking-wide bg-teal/10 text-teal px-1.5 py-0.5 rounded-full">Admin</span>}
          </span>
        )
      }
    },
    {
      key: 'account_type', header: 'Type', sortable: true,
      render: (r) => <span className="capitalize">{r.account_type}</span>
    },
    {
      key: 'background_check_status', header: 'BG Check',
      render: (r) => {
        if (r.account_type !== 'courier') return '—'
        const map = { not_started: 'text-slate', pending: 'text-teal', clear: 'text-green', consider: 'text-amber-600', rejected: 'text-red-500' }
        return <span className={`text-xs font-medium capitalize ${map[r.background_check_status] ?? 'text-slate'}`}>{r.background_check_status?.replace('_', ' ')}</span>
      }
    },
    {
      key: 'rating_avg', header: 'Rating',
      render: (r) => r.rating_count > 0 ? `${Number(r.rating_avg).toFixed(1)} (${r.rating_count})` : '—'
    },
    {
      key: 'is_suspended', header: 'Status',
      render: (r) => r.is_suspended ? <span className="text-red-500 text-xs font-medium">Suspended</span> : <span className="text-green text-xs font-medium">Active</span>
    },
    {
      key: 'created_at', header: 'Joined', sortable: true,
      render: (r) => <span className="text-slate text-xs">{fmtDate(r.created_at)}</span>
    },
  ]

  return (
    <div>
      <h1 className="font-display text-3xl font-black text-ink">Users</h1>
      <p className="text-sm text-slate mt-1 mb-6">Search and manage all accounts</p>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2 rounded-lg bg-mist border border-mist focus:border-teal focus:outline-none text-sm flex-1 max-w-xs"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-mist border border-mist focus:border-teal focus:outline-none text-sm"
        >
          <option value="all">All types</option>
          <option value="sender">Senders</option>
          <option value="courier">Couriers</option>
        </select>
      </div>

      {loading
        ? <div className="text-slate py-8 text-center">Loading…</div>
        : <DataTable
            rows={users}
            columns={columns}
            onRowClick={(r) => navigate(`/admin/users/${r.id}`)}
            emptyMessage="No users found."
          />
      }
    </div>
  )
}
