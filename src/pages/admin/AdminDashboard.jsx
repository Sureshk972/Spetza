import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import StatCard from '../../components/admin/StatCard.jsx'

function dollars(cents) {
  return '$' + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!hasSupabaseConfig) { setLoading(false); return }
    setLoading(true)

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

    const [users, senders, couriers, deliveries, completed, revenue, pendingChecks, ratings, openReports] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('account_type', 'sender'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('account_type', 'courier'),
      supabase.from('delivery_requests').select('id', { count: 'exact', head: true }),
      supabase.from('delivery_requests').select('id', { count: 'exact', head: true }).eq('status', 'delivered'),
      supabase.from('delivery_requests').select('platform_fee_cents').eq('status', 'delivered'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('background_check_status', 'consider'),
      supabase.from('ratings').select('id', { count: 'exact', head: true }),
      supabase.from('delivery_reports').select('id', { count: 'exact', head: true }).is('reviewed_at', null),
    ])

    const totalRevenue = (revenue.data ?? []).reduce((sum, r) => sum + (r.platform_fee_cents || 0), 0)

    // Recent signups (last 30 days)
    const recentSignups = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo)

    setStats({
      totalUsers: users.count ?? 0,
      senders: senders.count ?? 0,
      couriers: couriers.count ?? 0,
      totalDeliveries: deliveries.count ?? 0,
      completedDeliveries: completed.count ?? 0,
      totalRevenue,
      pendingChecks: pendingChecks.count ?? 0,
      totalRatings: ratings.count ?? 0,
      openReports: openReports.count ?? 0,
      recentSignups: recentSignups.count ?? 0,
    })
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="text-slate py-16 text-center">Loading dashboard…</div>

  const s = stats ?? {}

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-black text-ink">Dashboard</h1>
          <p className="text-sm text-slate mt-1">Overview of Spetza at a glance</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={s.totalUsers} hint={`${s.senders} senders · ${s.couriers} couriers`} />
        <StatCard label="Signups (30d)" value={s.recentSignups} />
        <StatCard label="Deliveries" value={s.totalDeliveries} hint={`${s.completedDeliveries} completed`} />
        <StatCard label="Revenue" value={dollars(s.totalRevenue)} hint="Platform fees earned" />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        <StatCard label="Ratings" value={s.totalRatings} />
        <Link to="/admin/verifications" className="block">
          <StatCard
            label="Pending Checks"
            value={s.pendingChecks}
            hint={s.pendingChecks > 0 ? 'Needs review →' : 'All clear'}
          />
        </Link>
        <Link to="/admin/reports" className="block">
          <StatCard
            label="Open Reports"
            value={s.openReports}
            hint={s.openReports > 0 ? 'Needs review →' : 'All clear'}
          />
        </Link>
        <StatCard
          label="Completion Rate"
          value={s.totalDeliveries > 0 ? Math.round((s.completedDeliveries / s.totalDeliveries) * 100) + '%' : '—'}
          hint="Delivered / total"
        />
      </div>

      {/* Quick links */}
      <div className="mt-10 grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { to: '/admin/users', label: 'Manage users', desc: 'Search, view, suspend' },
          { to: '/admin/deliveries', label: 'View deliveries', desc: 'Track all requests' },
          { to: '/admin/payments', label: 'Payment details', desc: 'Revenue breakdown' },
          { to: '/admin/verifications', label: 'Background checks', desc: 'Review flagged couriers' },
          { to: '/admin/ratings', label: 'Ratings', desc: 'Monitor feedback' },
          { to: '/admin/reports', label: 'Reports', desc: 'Misdescribed packages' },
        ].map(link => (
          <Link
            key={link.to}
            to={link.to}
            className="block p-4 rounded-xl border border-mist bg-white hover:border-teal hover:shadow-sm transition-all"
          >
            <div className="font-display font-bold text-ink">{link.label}</div>
            <div className="text-xs text-slate mt-1">{link.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
