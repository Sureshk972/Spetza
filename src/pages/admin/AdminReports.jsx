// Courier reports of packages that didn't match their description.
//
// The posting flow warns senders that repeated reports can cost them access.
// This is where that judgement actually gets made -- without it the warning
// is a bluff, and couriers learn quickly which rules are real.

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'

const REASON_LABEL = {
  too_heavy: 'Heavier than described',
  wrong_size: 'Bigger than the size given',
  prohibited_item: "Item we don't carry",
  not_as_described: 'Not what was described',
}

function when(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function AdminReports() {
  const { user } = useAuth()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [showReviewed, setShowReviewed] = useState(false)

  const load = useCallback(async () => {
    if (!hasSupabaseConfig) { setLoading(false); return }
    setLoading(true)
    let q = supabase
      .from('delivery_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (!showReviewed) q = q.is('reviewed_at', null)
    const { data } = await q
    const rows = data ?? []

    // Names aren't joinable here — delivery_reports references auth.users,
    // not profiles — so resolve them in one follow-up query.
    const ids = [...new Set(rows.flatMap(r => [r.sender_id, r.courier_id]))]
    const names = {}
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, is_suspended')
        .in('id', ids)
      for (const p of profs ?? []) names[p.id] = p
    }
    setReports(rows.map(r => ({ ...r, sender: names[r.sender_id], courier: names[r.courier_id] })))
    setLoading(false)
  }, [showReviewed])

  useEffect(() => { load() }, [load])

  const markReviewed = async (id) => {
    const { error } = await supabase
      .from('delivery_reports')
      .update({ reviewed_at: new Date().toISOString(), reviewed_by: user.id })
      .eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Marked reviewed.')
    load()
  }

  const name = (p) => (p ? [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unnamed' : 'Unknown')

  if (loading) return <div className="text-slate py-16 text-center">Loading reports…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-black text-ink">Reports</h1>
          <p className="text-sm text-slate mt-1">
            Packages a courier declined because they didn't match their description
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowReviewed(v => !v)}
          className="text-sm text-slate hover:text-ink underline underline-offset-4"
        >
          {showReviewed ? 'Show open only' : 'Show reviewed too'}
        </button>
      </div>

      {reports.length === 0 ? (
        <div className="p-10 rounded-xl border border-mist bg-white text-center text-slate">
          {showReviewed ? 'No reports yet.' : 'Nothing open. '}
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <div key={r.id} className="p-5 rounded-xl border border-mist bg-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-ink">
                    {REASON_LABEL[r.reason] ?? r.reason}
                  </div>
                  <div className="text-xs text-slate mt-1">
                    Reported by{' '}
                    <Link to={`/admin/users/${r.courier_id}`} className="text-teal hover:underline">
                      {name(r.courier)}
                    </Link>
                    {' · sender '}
                    <Link to={`/admin/users/${r.sender_id}`} className="text-teal hover:underline">
                      {name(r.sender)}
                    </Link>
                    {r.sender?.is_suspended && (
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-[10px] uppercase tracking-wide">
                        suspended
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-slate shrink-0">{when(r.created_at)}</div>
              </div>

              {r.note && (
                <p className="mt-3 text-sm text-slate leading-relaxed border-l-2 border-mist pl-3">
                  {r.note}
                </p>
              )}

              <div className="mt-4 flex items-center gap-3">
                <Link
                  to={`/admin/deliveries/${r.delivery_request_id}`}
                  className="text-xs text-teal hover:underline"
                >
                  View delivery →
                </Link>
                {!r.reviewed_at && (
                  <button
                    type="button"
                    onClick={() => markReviewed(r.id)}
                    className="ml-auto px-3 py-1.5 rounded-lg border border-mist text-xs text-ink hover:border-teal transition-colors"
                  >
                    Mark reviewed
                  </button>
                )}
                {r.reviewed_at && (
                  <span className="ml-auto text-xs text-slate">Reviewed {when(r.reviewed_at)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
