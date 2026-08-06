import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/deliveries', label: 'Deliveries' },
  { to: '/admin/payments', label: 'Payments' },
  { to: '/admin/verifications', label: 'Verifications' },
  { to: '/admin/ratings', label: 'Ratings' },
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
  const { user } = useAuth()

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
          <div className="px-3 text-xs text-slate truncate">{user?.email}</div>
          <button
            onClick={signOut}
            className="mt-2 px-3 py-1.5 text-xs text-slate hover:text-ink transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0 px-8 py-8 max-w-6xl">
        <Outlet />
      </main>
    </div>
  )
}
