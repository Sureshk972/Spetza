// Consistent footer for both Sender and Courier profile pages.
// - Role switch (backs up ChooseRole's "change later in settings" promise)
// - Sign out (replaces the old bottom-nav Sign-out tab)
// - Legal links (Privacy / Terms / Trust)
//
// Kept in one place so we can evolve trust content once and both roles
// stay in sync.

import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function ProfileFooterActions({ currentRole }) {
  const navigate = useNavigate()
  const { user, refreshProfile } = useAuth()
  const otherRole = currentRole === 'sender' ? 'courier' : 'sender'
  const otherLabel = otherRole === 'sender' ? 'Sender' : 'Courier'

  const switchRole = async () => {
    const ok = window.confirm(
      `Switch to ${otherLabel}? You can switch back anytime from your profile.`,
    )
    if (!ok) return
    const { error } = await supabase
      .from('profiles')
      .update({ account_type: otherRole, updated_at: new Date().toISOString() })
      .eq('id', user.id)
    if (error) {
      toast.error(error.message)
      return
    }
    await refreshProfile()
    navigate(otherRole === 'sender' ? '/sender' : '/courier', { replace: true })
  }

  const signOut = async () => {
    const ok = window.confirm('Sign out of Spetza?')
    if (!ok) return
    await supabase.auth.signOut()
    navigate('/welcome', { replace: true })
  }

  return (
    <div className="mt-8 space-y-3 pb-6">
      <button
        type="button"
        onClick={switchRole}
        className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-mist bg-white hover:border-teal transition-colors text-sm text-ink"
      >
        <span className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="17 1 21 5 17 9" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
          Switch to {otherLabel}
        </span>
        <span className="text-slate">→</span>
      </button>

      <button
        type="button"
        onClick={signOut}
        className="w-full flex items-center gap-2 px-4 py-3 rounded-lg border border-mist bg-white hover:border-red-300 transition-colors text-sm text-red-600"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Sign out
      </button>

      <div className="mt-6 flex justify-center gap-3 text-[11px] text-slate/60">
        <Link to="/privacy" className="hover:text-ink transition-colors">Privacy Policy</Link>
        <span>·</span>
        <Link to="/terms" className="hover:text-ink transition-colors">Terms of Service</Link>
        <span>·</span>
        <Link to="/trust" className="hover:text-ink transition-colors">Trust &amp; Safety</Link>
      </div>
    </div>
  )
}
