import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { buildLabel } from '../lib/build.js'

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/deliveries', label: 'Deliveries' },
  { to: '/admin/payments', label: 'Payments' },
  { to: '/admin/verifications', label: 'Verifications' },
  { to: '/admin/ratings', label: 'Ratings' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/demand', label: 'Demand Map' },
]

function SidebarLink({ to, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `block px-3 py-2 rounded-lg text-sm transition-colors ${
          isActive
            ? 'bg-teal/10 text-teal font-semibold'
            : 'text-slate hover:text-ink hover:bg-mist/50'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  // Where "back to app" goes. An admin with no role has nowhere to return to,
  // so the link is hidden rather than pointing at /choose-role.
  const appHome =
    profile?.account_type === 'courier'
      ? '/courier'
      : profile?.account_type === 'sender'
        ? '/sender'
        : null

  const signOut = async () => {
    await supabase.auth.signOut()
    navigate('/welcome', { replace: true })
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-mist bg-white px-4 py-6 flex flex-col">
        <div className="px-3 mb-6">
          <div className="font-display text-lg font-black text-ink">Spetza</div>
          <div className="text-[10px] uppercase tracking-widest text-teal font-bold">Admin</div>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {NAV.map(n => (
            <SidebarLink key={n.to} {...n} />
          ))}
        </nav>
        <div className="mt-auto pt-4 border-t border-mist">
          {appHome && (
            <Link
              to={appHome}
              className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg text-sm text-slate hover:text-ink hover:bg-mist/50 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Back to app
            </Link>
          )}
          <div className="px-3 text-xs text-slate truncate">{user?.email}</div>
          <button
            onClick={signOut}
            className="mt-2 px-3 py-1.5 text-xs text-slate hover:text-ink transition-colors"
          >
            Sign out
          </button>
          {/* Which build this panel is running. An admin reading a bug report
              needs to know whether their own view is as stale as the one
              being described. */}
          <div className="mt-3 px-3 text-[10px] text-slate/50">
            Build {buildLabel()}
          </div>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0 px-8 py-8 max-w-6xl">
        <Outlet />
      </main>
    </div>
  )
}
