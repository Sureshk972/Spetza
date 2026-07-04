import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'

const DOC_LABEL = { selfie: 'Selfie', id_front: 'ID front', id_back: 'ID back' }

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function AdminVerifications() {
  const [couriers, setCouriers] = useState([])
  const [loading, setLoading] = useState(true)
  const [signed, setSigned] = useState({})
  const [acting, setActing] = useState(null)

  const refresh = useCallback(async () => {
    if (!hasSupabaseConfig) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, verification_submitted_at, verification_notes')
      .eq('account_type', 'courier')
      .eq('verification_status', 'pending')
      .order('verification_submitted_at', { ascending: true })

    if (!profs || profs.length === 0) {
      setCouriers([])
      setLoading(false)
      return
    }
    const ids = profs.map((p) => p.id)
    const { data: docs } = await supabase
      .from('verification_documents')
      .select('courier_id, doc_type, storage_path')
      .in('courier_id', ids)

    const byCourier = new Map()
    for (const p of profs) byCourier.set(p.id, { ...p, docs: [] })
    for (const d of docs ?? []) {
      byCourier.get(d.courier_id)?.docs.push(d)
    }
    setCouriers(Array.from(byCourier.values()))
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const viewDoc = async (courier, doc) => {
    const key = `${courier.id}:${doc.doc_type}`
    if (signed[key]) {
      window.open(signed[key], '_blank')
      return
    }
    const { data, error } = await supabase.storage
      .from('courier-verification')
      .createSignedUrl(doc.storage_path, 60)
    if (error) {
      toast.error(error.message)
      return
    }
    setSigned((s) => ({ ...s, [key]: data.signedUrl }))
    window.open(data.signedUrl, '_blank')
  }

  const decide = async (courier, decision) => {
    let notes = null
    if (decision === 'rejected') {
      notes = window.prompt('Reason (shown to courier):')
      if (notes == null) return
    }
    setActing(courier.id)
    const { error } = await supabase.functions.invoke('review-verification', {
      body: { courier_id: courier.id, decision, notes },
    })
    setActing(null)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(decision === 'approved' ? 'Approved' : 'Rejected')
    refresh()
  }

  return (
    <div className="min-h-full px-6 py-12 max-w-3xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-signal">Admin</div>
          <h1 className="font-serif text-3xl text-ink mt-1">Verification queue</h1>
        </div>
        <Link to="/" className="text-sm text-slate hover:text-ink">Back</Link>
      </header>

      <div className="mt-10">
        {loading ? (
          <div className="text-slate">Loading…</div>
        ) : couriers.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-mist">
            <p className="text-slate">Nothing pending.</p>
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
                      Submitted {fmtDate(c.verification_submitted_at)}
                    </div>
                  </div>
                  <div className="text-xs text-slate">{c.id.slice(0, 8)}</div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {c.docs.map((d) => (
                    <button
                      key={d.doc_type}
                      onClick={() => viewDoc(c, d)}
                      className="px-3 py-1 rounded-lg border border-mist text-sm text-slate hover:border-signal hover:text-ink"
                    >
                      {DOC_LABEL[d.doc_type] ?? d.doc_type} ↗
                    </button>
                  ))}
                  {c.docs.length === 0 && (
                    <span className="text-xs text-slate">No documents on record.</span>
                  )}
                </div>

                <div className="mt-5 flex gap-2 justify-end">
                  <button
                    onClick={() => decide(c, 'rejected')}
                    disabled={acting === c.id}
                    className="px-3 py-1.5 rounded-lg border border-mist text-sm text-slate hover:border-red-500 hover:text-red-600 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => decide(c, 'approved')}
                    disabled={acting === c.id}
                    className="px-3 py-1.5 rounded-lg bg-forest text-cream text-sm font-medium hover:opacity-90 disabled:opacity-50"
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
