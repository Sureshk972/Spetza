import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { trackEvent, identifyUser } from '../lib/analytics.js'

function readRole() {
  try {
    const r = sessionStorage.getItem('spetza:intended_role')
    return r === 'sender' || r === 'courier' ? r : null
  } catch {
    return null
  }
}

export default function SignUp() {
  const { user } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])
  const [step, setStep] = useState('email') // 'email' | 'password'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const role = readRole()

  const requireConfig = () => {
    if (hasSupabaseConfig) return true
    toast.error('Supabase not configured.')
    return false
  }

  const continueWithEmail = (e) => {
    e.preventDefault()
    if (!email || !requireConfig()) return
    setStep('password')
  }

  const createAccount = async (e) => {
    e.preventDefault()
    if (!email || !password || !requireConfig()) return
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters.')
      return
    }
    setSubmitting(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      setSubmitting(false)
      if (/already registered/i.test(error.message)) {
        toast.error('This email already has an account. Sign in instead, or use "Forgot password?" if needed.')
      } else {
        toast.error(error.message)
      }
      return
    }

    // Write a profile row right away (before any navigation). RequireAuth
    // only gates on phone-verified / name-captured when `profile` is
    // non-null — with no row yet, a fresh signup falls straight through
    // to /choose-role, skipping phone verification entirely. Baking the
    // stashed role in here also lets ChooseRole be skipped later.
    if (data?.user?.id && data?.session) {
      const patch = { id: data.user.id, updated_at: new Date().toISOString() }
      if (role) patch.account_type = role
      const { error: profileErr } = await supabase.from('profiles').upsert(patch)
      if (profileErr) {
        console.error('Failed to create profile row after signup', profileErr)
      }

      // Tie all subsequent events to this user and seed the profile.
      identifyUser(data.user.id, { email, role: role || 'unknown' })
      trackEvent('signup_completed', { role: role || 'unknown' })
    }
    setSubmitting(false)
  }

  return (
    <div className="min-h-full flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Link to="/welcome" className="text-sm text-slate hover:text-ink">
          &larr; back
        </Link>
        <h1 className="font-serif text-3xl text-ink mt-6">Create an account</h1>
        {role && (
          <p className="text-sm text-slate mt-2">
            Signing up as{' '}
            <span className="text-signal uppercase tracking-widest text-xs font-medium">
              {role}
            </span>
            {' · '}
            <Link to="/welcome" className="text-signal hover:underline">Change</Link>
          </p>
        )}

        {step === 'email' ? (
          <>
            <form onSubmit={continueWithEmail} className="mt-6 space-y-4">
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
              />
              <button
                type="submit"
                className="w-full px-4 py-3 rounded-lg bg-ink text-cream font-medium hover:bg-signal transition-colors"
              >
                Continue
              </button>
            </form>
            <p className="text-slate text-sm text-center mt-6">
              Already have an account?{' '}
              <Link to="/signin" className="text-signal hover:underline">Sign in</Link>
            </p>
          </>
        ) : (
          <>
            <form onSubmit={createAccount} className="mt-6 space-y-4">
              <div className="px-4 py-3 rounded-lg bg-mist text-slate text-sm flex items-center justify-between">
                <span>{email}</span>
                <button
                  type="button"
                  onClick={() => {
                    setStep('email')
                    setPassword('')
                  }}
                  className="text-xs text-signal hover:underline"
                >
                  change
                </button>
              </div>
              <input
                type="password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (at least 6 characters)"
                className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-3 rounded-lg bg-ink text-cream font-medium hover:bg-signal transition-colors disabled:opacity-50"
              >
                {submitting ? 'Creating…' : 'Create account'}
              </button>
            </form>
            <p className="text-slate text-sm text-center mt-6">
              Already have an account?{' '}
              <Link to="/signin" className="text-signal hover:underline">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
