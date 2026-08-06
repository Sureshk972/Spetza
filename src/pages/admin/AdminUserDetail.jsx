import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import DataTable from '../../components/admin/DataTable.jsx'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function dollars(cents) {
  if (!cents) return '—'
  return '$' + (cents / 100).toFixed(2)
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-slate">{label}</div>
      <div className="text-ink mt-0.5">{value ?? '—'}</div>
    </div>
  )
}

export default function AdminUserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  const load = useCallback(async () => {
    if (!hasSupabaseConfig) { setLoading(false); return }
    setLoading(true)
    const [p, d] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).single(),
      supabase
        .from('delivery_requests')
        .select('id, order_number, status, max_price_cents, platform_fee_cents, created_at')
        .or(`sender_id.eq.${id},courier_id.eq.${id}`)
        .order('created_at', { ascending: false })
        .limit(50),
    ])
    setProfile(p.data)
    setDeliveries(d.data ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const toggleSuspend = async () => {
    if (!profile) return
    const next = !profile.is_suspended
    const msg = next ? 'Suspend this user?' : 'Unsuspend this user?'
    if (!window.confirm(msg)) return
    setActing(true)
    const { error } = await supabase.from('profiles').update({ is_suspended: next }).eq('id', id)
    setActing(false)
    if (error) { toast.error(error.message); return }
    toast.success(next ? 'User suspended' : 'User unsuspended')
    load()
  }

  if (loading) return <div className="text-slate py-16 text-center">Loading…</div>
  if (!profile) return <div className="text-slate py-16 text-center">User not found.</div>

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Unnamed'

  const deliveryCols = [
    { key: 'order_number', header: 'Order', sortable: true },
    { key: 'status', header: 'Status', render: (r) => <span className="capitalize">{r.status}</span> },
    { key: 'max_price_cents', header: 'Price', render: (r) => dollars(r.max_price_cents) },
    { key: 'platform_fee_cents', header: 'Fee', render: (r) => dollars(r.platform_fee_cents) },
    { key: 'created_at', header: 'Created', render: (r) => <span className="text-xs text-slate">{fmtDate(r.created_at)}</span> },
  ]

  return (
    <div>
      <Link to="/admin/users" className="text-sm text-slate hover:text-ink">&larr; All users</Link>

      <div className="flex items-start justify-between mt-4">
        <div>
          <h1 className="font-display text-3xl font-black text-ink">{name}</h1>
          {profile.is_admin && (
            <span className="inline-block mt-1 text-[10px] uppercase tracking-wide bg-teal/10 text-teal px-2 py-0.5 rounded-full font-bold">Admin</span>
          )}
        </div>
        {!profile.is_admin && (
          <button
            onClick={toggleSuspend}
            disabled={acting}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
              profile.is_suspended
                ? 'border-green text-green hover:bg-green hover:text-white'
                : 'border-red-300 text-red-500 hover:bg-red-500 hover:text-white'
            }`}
          >
            {profile.is_suspended ? 'Unsuspend' : 'Suspend'}
          </button>
        )}
      </div>

      {/* Profile fields */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 mt-8 p-6 rounded-xl border border-mist bg-white">
        <Field label="Type" value={<span className="capitalize">{profile.account_type}</span>} />
        <Field label="Status" value={profile.is_suspended ? <span className="text-red-500">Suspended</span> : <span className="text-green">Active</span>} />
        <Field label="Phone Verified" value={profile.is_phone_verified ? 'Yes' : 'No'} />
        <Field label="Rating" value={profile.rating_count > 0 ? `${Number(profile.rating_avg).toFixed(1)} (${profile.rating_count} reviews)` : 'No ratings'} />
        <Field label="Joined" value={fmtDate(profile.created_at)} />
        {profile.account_type === 'courier' && (
          <>
            <Field label="BG Check" value={<span className="capitalize">{profile.background_check_status?.replace('_', ' ')}</span>} />
            <Field label="Service Radius" value={profile.service_radius_miles ? `${profile.service_radius_miles} mi` : 'Not set'} />
            <Field label="Stripe Payouts" value={profile.stripe_connect_payouts_enabled ? <span className="text-green">Enabled</span> : 'Not set up'} />
          </>
        )}
        {profile.account_type === 'sender' && (
          <Field label="Payment Method" value={profile.stripe_default_payment_method_id ? 'On file' : 'None'} />
        )}
      </div>

      {/* Delivery history */}
      <h2 className="font-display text-xl font-bold text-ink mt-10 mb-4">Delivery History</h2>
      <DataTable
        rows={deliveries}
        columns={deliveryCols}
        onRowClick={(r) => navigate(`/admin/deliveries/${r.id}`)}
        emptyMessage="No deliveries yet."
      />
    </div>
  )
}
