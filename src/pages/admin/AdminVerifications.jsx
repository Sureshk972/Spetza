import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
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

  return (
    <div className="min-h-full px-6 py-12 max-w-3xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-teal">Admin</div>
          <h1 className="font-display text-3xl text-ink mt-1">Background checks — review</h1>
        </div>
        <Link to="/" className="text-sm text-slate hover:text-ink">Back</Link>
      </header>

      <div className="mt-10">
        {loading ? (
          <div className="text-slate">Loading…</div>
        ) : couriers.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-mist">
            <p className="text-slate">Nothing to review.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {couriers.map((c) => (
              <li key={c.id} className="p-5 rounded-xl border border-mist bg-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-ink font-medium">
                      {c.first_name || c.last_name
                        ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()
                        : 'Unnamed courier'}
                    </div>
                    <div className="text-xs text-slate mt-0.5">
                      Flagged {fmtDate(c.background_check_updated_at)}
                    </div>
                  </div>
                  {c.checkr_candidate_id && (
                    <a
                      href={`${CHECKR_DASH}${c.checkr_candidate_id}`}
                      target="_blank" rel="noreferrer"
                      className="text-xs text-teal hover:underline"
                    >
                      View report in Checkr ↗
                    </a>
                  )}
                </div>
                <div className="mt-5 flex gap-2 justify-end">
                  <button
                    onClick={() => decide(c, 'rejected')}
                    disabled={acting === c.id}
                    className="px-3 py-1.5 rounded-lg border border-mist text-sm text-slate hover:border-red-500 hover:text-red-600 disabled:opacity-50"
                  >
                    Deny
                  </button>
                  <button
                    onClick={() => decide(c, 'approved')}
                    disabled={acting === c.id}
                    className="px-3 py-1.5 rounded-lg bg-green text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    Approve
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
