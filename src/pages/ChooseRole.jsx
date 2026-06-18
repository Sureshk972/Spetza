import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function ChooseRole() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)

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
      toast.error(error.message)
      return
    }
    await refreshProfile()
    navigate(role === 'sender' ? '/sender' : '/courier', { replace: true })
  }

  return (
    <div className="min-h-full flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl">
        <h1 className="font-serif text-3xl text-ink text-center">How will you use Spetza?</h1>
        <p className="text-slate text-center mt-2">You can change this later in settings.</p>
        <div className="grid sm:grid-cols-2 gap-4 mt-10">
          <button
            onClick={() => choose('sender')}
            disabled={busy !== null}
            className="text-left p-6 rounded-2xl border border-mist hover:border-signal hover:shadow-md transition-all disabled:opacity-50"
          >
            <div className="text-xs uppercase tracking-widest text-signal">Sender</div>
            <div className="font-serif text-2xl text-ink mt-2">I need something delivered</div>
            <p className="text-slate mt-3 text-sm">
              Post a pickup and dropoff, and a nearby courier will take it from here.
            </p>
            {busy === 'sender' && <div className="text-slate text-xs mt-3">Saving…</div>}
          </button>
          <button
            onClick={() => choose('courier')}
            disabled={busy !== null}
            className="text-left p-6 rounded-2xl border border-mist hover:border-forest hover:shadow-md transition-all disabled:opacity-50"
          >
            <div className="text-xs uppercase tracking-widest text-forest">Courier</div>
            <div className="font-serif text-2xl text-ink mt-2">I want to earn delivering</div>
            <p className="text-slate mt-3 text-sm">
              See open requests near you. Accept what fits your route.
            </p>
            {busy === 'courier' && <div className="text-slate text-xs mt-3">Saving…</div>}
          </button>
        </div>
      </div>
    </div>
  )
}
