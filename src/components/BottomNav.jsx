import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

function TabLink({ to, label, children }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex flex-col items-center justify-center flex-1 py-2 gap-1 text-xs transition-colors ${
          isActive ? 'text-ink' : 'text-slate/70 hover:text-ink'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`inline-flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
              isActive ? 'bg-mist' : ''
            }`}
          >
            {children}
          </span>
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}

function TabButton({ onClick, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center flex-1 py-2 gap-1 text-xs text-slate/70 hover:text-ink transition-colors"
    >
      <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg">
        {children}
      </span>
      <span>{label}</span>
    </button>
  )
}

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  width: 22,
  height: 22,
}

export default function BottomNav({ variant = 'sender' }) {
  const navigate = useNavigate()
  const signOut = async () => {
    await supabase.auth.signOut()
    navigate('/welcome', { replace: true })
  }

  const base = variant === 'courier' ? '/courier' : '/sender'

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-mist"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-3xl mx-auto flex items-stretch">
        <TabLink to={base} label="Discover">
          <svg {...iconProps}>
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        </TabLink>
        <TabLink to={`${base}/inbox`} label="Inbox">
          <svg {...iconProps}>
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </TabLink>
        <TabLink to={`${base}/profile`} label="Profile">
          <svg {...iconProps}>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </TabLink>
        <TabButton onClick={signOut} label="Sign out">
          <svg {...iconProps}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </TabButton>
      </div>
    </nav>
  )
}
