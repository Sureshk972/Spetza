import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import DataTable from '../../components/admin/DataTable.jsx'

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

/**
 * Everyone who joined the pre-launch waitlist from the coming-soon page.
 *
 * The split between senders and couriers is the number that matters at launch:
 * a sender's first package has nowhere to go until couriers exist, so couriers
 * get invited first.
 */
export default function AdminWaitlist() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!hasSupabaseConfig) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('waitlist_signups')
      .select('id, email, interest, created_at')
      .order('created_at', { ascending: false })
      .limit(1000)
    setRows(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const counts = useMemo(() => ({
    total: rows.length,
    courier: rows.filter((r) => r.interest === 'courier').length,
    sender: rows.filter((r) => r.interest === 'sender').length,
    unsaid: rows.filter((r) => !r.interest).length,
  }), [rows])

  const copyEmails = async () => {
    try {
      await navigator.clipboard.writeText(rows.map((r) => r.email).join(', '))
    } catch {
      // Clipboard is blocked outside a secure context or without permission.
      // The addresses are on screen either way.
    }
  }

  const columns = [
    {
      key: 'created_at', header: 'Joined', sortable: true,
      render: (r) => <span className="text-xs text-slate">{fmtDate(r.created_at)}</span>,
    },
    {
      key: 'email', header: 'Email',
      render: (r) => <span className="text-sm">{r.email}</span>,
    },
    {
      key: 'interest', header: 'Here to', sortable: true,
      render: (r) => {
        if (!r.interest) return <span className="text-xs text-slate italic">Didn't say</span>
        const courier = r.interest === 'courier'
        return (
          <span className={`text-xs font-semibold ${courier ? 'text-green' : 'text-teal'}`}>
            {courier ? 'Earn as a courier' : 'Send packages'}
          </span>
        )
      },
    },
  ]

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black text-ink">Waitlist</h1>
          <p className="text-sm text-slate mt-1 mb-6">
            Sign-ups from the coming-soon page, newest first
          </p>
        </div>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={copyEmails}
            className="text-xs font-semibold text-teal border border-teal/30 rounded-lg px-3 py-2 hover:bg-teal/5 transition-colors"
          >
            Copy all addresses
          </button>
        )}
      </div>

      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total', value: counts.total, tone: 'text-ink' },
            { label: 'Couriers', value: counts.courier, tone: 'text-green' },
            { label: 'Senders', value: counts.sender, tone: 'text-teal' },
            { label: "Didn't say", value: counts.unsaid, tone: 'text-slate' },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-slate/10 rounded-xl px-4 py-3">
              <div className={`font-display text-2xl font-black tabular-nums ${s.tone}`}>{s.value}</div>
              <div className="text-xs text-slate mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {loading
        ? <div className="text-slate py-8 text-center">Loading…</div>
        : <DataTable
            rows={rows}
            columns={columns}
            emptyMessage="Nobody has joined the waitlist yet."
          />
      }
    </div>
  )
}
