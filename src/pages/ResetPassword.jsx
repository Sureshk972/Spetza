import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function ResetPassword() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      toast.error('Reset link is invalid or expired. Request a new one.')
      navigate('/signin', { replace: true })
    }
  }, [loading, user, navigate])

  const submit = async (e) => {
    e.preventDefault()
    if (!hasSupabaseConfig) {
      toast.error('Supabase not configured.')
      return
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      toast.error('Passwords don’t match.')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Password updated.')
    navigate('/', { replace: true })
  }

  if (loading || !user) {
    return (
      <div className="min-h-full flex items-center justify-center px-6 py-16">
        <p className="text-slate">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-full flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-3xl text-ink">Set a new password</h1>
        <p className="text-slate mt-2 text-sm">
          Signed in as <span className="text-ink">{user.email}</span>. Choose a new password to finish.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input
            type="password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
          />
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-3 rounded-lg bg-ink text-cream font-medium hover:bg-signal transition-colors disabled:opacity-50"
          >
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
