import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import DataTable from '../../components/admin/DataTable.jsx'
import { useAppSetting } from '../../hooks/useAppSetting.js'
import { useAuth } from '../../context/AuthContext.jsx'

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const CHECKR_DASH = 'https://dashboard.checkr.com/candidates/'

export default function AdminVerifications() {
  const [couriers, setCouriers] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)
  const { user } = useAuth()

  // Who pays the $40 check. Read by the verify page, the welcome page, the
  // FAQ and both edge functions, so flipping it here changes all of them.
  const { value: courierPaysSetting, loaded: settingLoaded } = useAppSetting('courier_pays_background_check', true)
  const [courierPays, setCourierPays] = useState(true)
  const [savingSetting, setSavingSetting] = useState(false)
  useEffect(() => { if (settingLoaded) setCourierPays(courierPaysSetting) }, [settingLoaded, courierPaysSetting])

  const toggleCourierPays = async () => {
    const next = !courierPays
    const ok = window.confirm(next
      ? 'Couriers will pay the $40 background check themselves (earned back $1 per delivery). Continue?'
      : 'Spetza will cover the $40 background check for every courier who starts one from now on. Continue?')
    if (!ok) return
    setSavingSetting(true)
    const { error } = await supabase
      .from('app_settings')
      .update({ value: next, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
      .eq('key', 'courier_pays_background_check')
    setSavingSetting(false)
    if (error) { toast.error(error.message); return }
    setCourierPays(next)
    toast.success(next ? 'Couriers pay the check' : 'Spetza covers the check')
  }

  const refresh = useCallback(async () => {
    if (!hasSupabaseConfig) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, checkr_candidate_id, checkr_report_id, background_check_updated_at, checkr_display_status, checkr_assessment, checkr_includes_canceled')
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
    {
      // Checkr requires the report's own status and Assess tag be displayed
      // in our application, not just stored (Customer API Integration
      // Guidance v3.0, "Webhooks and Status Mappings").
      key: 'checkr_display_status', header: 'Checkr status',
      render: (c) => (
        <span className="flex items-center gap-1.5">
          <span className="text-xs font-medium">{c.checkr_display_status ?? '—'}</span>
          {c.checkr_includes_canceled && (
            <span
              title="Report completed with one or more canceled screenings"
              className="text-xs text-amber-600"
            >
              ⚠
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'checkr_assessment', header: 'Assess',
      render: (c) => c.checkr_assessment
        ? <span className="text-xs capitalize text-slate">{c.checkr_assessment}</span>
        : <span className="text-xs text-slate">—</span>
    },
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

      <div className="mb-8 p-4 rounded-xl border border-mist bg-white flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-ink">Who pays the $40 background check</div>
          <div className="text-xs text-slate mt-1 leading-relaxed">
            {courierPays
              ? 'Couriers pay via Stripe Checkout before the check starts and earn it back at $1 per delivery.'
              : 'Spetza covers it. No Checkout step, no earn-back. Applies to checks started from now on.'}
          </div>
        </div>
        <button
          onClick={toggleCourierPays}
          disabled={savingSetting || !settingLoaded}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
            courierPays
              ? 'border-mist text-ink hover:border-ink'
              : 'border-green/40 bg-green/10 text-green hover:bg-green/20'
          }`}
        >
          {savingSetting ? 'Saving…' : courierPays ? 'Courier pays' : 'Spetza covers'}
        </button>
      </div>

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
