import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import DataTable from '../../components/admin/DataTable.jsx'

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const CHECKR_DASH = 'https://dashboard.checkr.com/candidates/'

export default function AdminVerifications() {
  const [couriers, setCouriers] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)

  const refresh = useCallback(async () => {
    if (!hasSupabaseConfig) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, checkr_candidate_id, checkr_report_id, background_check_updated_at')
      .eq('account_type', 'courier')
      .eq('background_check_status', 'consider')
      .order('background_check_updated_at', { ascending: true })
    setCouriers(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const decide = async (courier, decision) => {
    let notes = null
    if (decision === 'rejected') {
      notes = window.prompt('Reason (kept internal; Checkr sends the courier the FCRA notices):')
      if (notes == null) return
    }
    setActing(courier.id)
    const { error } = await supabase.functions.invoke('adjudicate-background-check', {
      body: { courier_id: courier.id, decision, notes },
    })
    setActing(null)
    if (error) { toast.error(error.message); return }
    toast.success(decision === 'approved' ? 'Cleared' : 'Rejected (adverse action started)')
    refresh()
  }

  const name = (c) => [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed courier'

  const columns = [
    { key: 'name', header: 'Courier', render: (c) => <span className="font-medium">{name(c)}</span> },
    { key: 'background_check_updated_at', header: 'Flagged', sortable: true, render: (c) => <span className="text-xs text-slate">{fmtDate(c.background_check_updated_at)}</span> },
    {
      key: 'checkr', header: 'Checkr',
      render: (c) => c.checkr_candidate_id
        ? <a href={`${CHECKR_DASH}${c.checkr_candidate_id}`} target="_blank" rel="noreferrer" className="text-teal text-xs hover:underline">View report ↗</a>
        : '—'
    },
    {
      key: 'actions', header: '',
      render: (c) => (
        <div className="flex gap-2 justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); decide(c, 'rejected') }}
            disabled={acting === c.id}
            className="px-3 py-1 rounded-lg border border-mist text-xs text-slate hover:border-red-500 hover:text-red-600 disabled:opacity-50"
          >
            Deny
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); decide(c, 'approved') }}
            disabled={acting === c.id}
            className="px-3 py-1 rounded-lg bg-green text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
          >
            Approve
          </button>
        </div>
      )
    },
  ]

  return (
    <div>
      <h1 className="font-display text-3xl font-black text-ink">Background Checks</h1>
      <p className="text-sm text-slate mt-1 mb-6">Couriers flagged by Checkr for manual review</p>

      {loading
        ? <div className="text-slate py-8 text-center">Loading…</div>
        : <DataTable
            rows={couriers}
            columns={columns}
            emptyMessage="Nothing to review — all clear."
          />
      }
    </div>
  )
}
