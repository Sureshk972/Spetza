import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'

export default function NameCapture() {
  const navigate = useNavigate()
  const { user, profile, refreshProfile } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile?.first_name) {
      setFirstName(profile.first_name)
      setLastName(profile.last_name || '')
    }
  }, [profile])

  const submit = async (e) => {
    e.preventDefault()
    if (!hasSupabaseConfig || !user) {
      toast.error('Supabase not configured.')
      return
    }
    const cleaned = firstName.trim()
    if (!cleaned) {
      toast.error('First name is required.')
      return
    }
    setSaving(true)
    let intendedRole = null
    try {
      const stashed = sessionStorage.getItem('spetza:intended_role')
      if (stashed === 'sender' || stashed === 'courier') intendedRole = stashed
    } catch {
      // private tabs can throw; fall through to ChooseRole
    }
    const patch = {
      id: user.id,
      first_name: cleaned,
      last_name: lastName.trim() || null,
      updated_at: new Date().toISOString(),
    }
    if (intendedRole) patch.account_type = intendedRole
    const { error } = await supabase.from('profiles').upsert(patch)
    if (error) {
      setSaving(false)
      toast.error(error.message)
      return
    }
    if (intendedRole) {
      try {
        sessionStorage.removeItem('spetza:intended_role')
      } catch {}
    }
    await refreshProfile()
    setSaving(false)
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-full flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-3xl text-ink">What should we call you?</h1>
        <p className="text-slate mt-2 text-sm">
          This is how couriers and senders will see you on delivery cards and ratings.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate/70">First name</label>
            <input
              type="text"
              required
              autoFocus
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jane"
              className="w-full mt-1 px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate/70">Last name (optional)</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Doe"
              className="w-full mt-1 px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full px-4 py-3 rounded-lg bg-ink text-cream font-medium hover:bg-signal transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
