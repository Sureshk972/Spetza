import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import Footer from '../components/Footer.jsx'

export default function ChooseRole() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)
  const autoSelected = useRef(false)

  if (profile?.account_type === 'sender') {
    navigate('/sender', { replace: true })
    return null
  }
  if (profile?.account_type === 'courier') {
    navigate('/courier', { replace: true })
    return null
  }

  const choose = async (role) => {
    if (!hasSupabaseConfig) {
      toast.error('Supabase not configured.')
      return
    }
    setBusy(role)
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, account_type: role, updated_at: new Date().toISOString() })
    setBusy(null)
    if (error) {
      // Stale session — the auth.users row was deleted (e.g., admin cleanup)
      // but the client still holds a valid JWT. Sign out and send them to
      // sign up so they don't loop forever hitting the FK violation.
      if (error.code === '23503' || /profiles_id_fkey/.test(error.message)) {
        toast.error('Your session is out of date. Please sign in again.')
        await supabase.auth.signOut()
        navigate('/signup', { replace: true })
        return
      }
      toast.error(error.message)
      return
    }
    await refreshProfile()
    navigate(role === 'sender' ? '/sender' : '/courier', { replace: true })
  }

  // Auto-select if user already chose a role on the Welcome page
  useEffect(() => {
    if (autoSelected.current) return
    try {
      const intended = localStorage.getItem('spetza:intended_role')
      if (intended === 'sender' || intended === 'courier') {
        autoSelected.current = true
        localStorage.removeItem('spetza:intended_role')
        choose(intended)
      }
    } catch {
      // localStorage unavailable — show the picker
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-full flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl">
        <h1 className="font-display text-3xl text-ink text-center">How will you use Spetza?</h1>
        <p className="text-slate text-center mt-2">Pick the one that fits.</p>
        <div className="grid sm:grid-cols-2 gap-4 mt-10">
          <button
            onClick={() => choose('sender')}
            disabled={busy !== null}
            className="text-left p-6 rounded-2xl border border-mist hover:border-teal hover:shadow-md transition-all disabled:opacity-50"
          >
            <div className="text-xs uppercase tracking-widest text-teal">Sender</div>
            <div className="font-display text-2xl text-ink mt-2">I need something delivered</div>
            <p className="text-slate mt-3 text-sm">
              Post a pickup and dropoff, and a nearby courier will take it from here.
            </p>
            {busy === 'sender' && <div className="text-slate text-xs mt-3">Saving…</div>}
          </button>
          <button
            onClick={() => choose('courier')}
            disabled={busy !== null}
            className="text-left p-6 rounded-2xl border border-mist hover:border-green hover:shadow-md transition-all disabled:opacity-50"
          >
            <div className="text-xs uppercase tracking-widest text-green">Courier</div>
            <div className="font-display text-2xl text-ink mt-2">I want to earn delivering</div>
            <p className="text-slate mt-3 text-sm">
              See open requests near you. Accept what fits your route.
            </p>
            {busy === 'courier' && <div className="text-slate text-xs mt-3">Saving…</div>}
          </button>
        </div>
        <Footer />
      </div>
    </div>
  )
}
