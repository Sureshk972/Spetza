import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import DataTable from '../../components/admin/DataTable.jsx'

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function Stars({ count }) {
  return <span className="text-teal">{'★'.repeat(count)}{'☆'.repeat(5 - count)}</span>
}

export default function AdminRatings() {
  const [ratings, setRatings] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!hasSupabaseConfig) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('ratings')
      .select(`
        id, stars, comment, created_at,
        rater:profiles!ratings_rater_id_fkey(id, first_name, last_name),
        ratee:profiles!ratings_ratee_id_fkey(id, first_name, last_name),
        delivery_request:delivery_requests!ratings_delivery_request_id_fkey(order_number)
      `)
      .order('created_at', { ascending: false })
      .limit(200)
    setRatings(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const profileName = (p) => p ? [p.first_name, p.last_name].filter(Boolean).join(' ') || '—' : '—'

  const columns = [
    { key: 'created_at', header: 'Date', sortable: true, render: (r) => <span className="text-xs text-slate">{fmtDate(r.created_at)}</span> },
    { key: 'stars', header: 'Rating', sortable: true, render: (r) => <Stars count={r.stars} /> },
    { key: 'comment', header: 'Comment', render: (r) => <span className="text-sm">{r.comment ? (r.comment.length > 80 ? r.comment.slice(0, 80) + '…' : r.comment) : <span className="text-slate italic">No comment</span>}</span> },
    {
      key: 'rater', header: 'From',
      render: (r) => r.rater ? <Link to={`/admin/users/${r.rater.id}`} className="text-teal hover:underline text-xs">{profileName(r.rater)}</Link> : '—'
    },
    {
      key: 'ratee', header: 'To',
      render: (r) => r.ratee ? <Link to={`/admin/users/${r.ratee.id}`} className="text-teal hover:underline text-xs">{profileName(r.ratee)}</Link> : '—'
    },
    {
      key: 'delivery', header: 'Delivery',
      render: (r) => r.delivery_request?.order_number ? <span className="text-xs font-display font-medium">{r.delivery_request.order_number}</span> : '—'
    },
  ]

  return (
    <div>
      <h1 className="font-display text-3xl font-black text-ink">Ratings</h1>
      <p className="text-sm text-slate mt-1 mb-6">All ratings and reviews across the platform</p>

      {loading
        ? <div className="text-slate py-8 text-center">Loading…</div>
        : <DataTable
            rows={ratings}
            columns={columns}
            emptyMessage="No ratings yet."
          />
      }
    </div>
  )
}
