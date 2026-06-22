import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function SignIn() {
  const { user } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])
  const [step, setStep] = useState('email') // 'email' | 'password' | 'magic-sent'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

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

  const trySignIn = async (e) => {
    e.preventDefault()
    if (!email || !password || !requireConfig()) return
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (error) {
      if (/invalid login credentials/i.test(error.message)) {
        toast.error(
          'Wrong password. If you signed up via magic link previously, this account may not have a password — use "Email me a sign-in link" below.'
        )
      } else {
        toast.error(error.message)
      }
      return
    }
  }

  const createAccount = async () => {
    if (!email || !password || !requireConfig()) return
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters.')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    })
    setSubmitting(false)
    if (error) {
      if (/already registered/i.test(error.message)) {
        toast.error('This email already has an account. Try "Sign in" or use the magic link below.')
      } else {
        toast.error(error.message)
      }
      return
    }
  }

  const sendMagicLink = async () => {
    if (!email || !requireConfig()) return
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setSubmitting(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setStep('magic-sent')
  }

  return (
    <div className="min-h-full flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Link to="/welcome" className="text-sm text-slate hover:text-ink">
          &larr; back
        </Link>
        <h1 className="font-serif text-3xl text-ink mt-6">Sign in</h1>

        {step === 'magic-sent' ? (
          <div className="mt-6 space-y-4">
            <p className="text-slate">
              Check your inbox at <span className="text-ink">{email}</span> for a sign-in link.
            </p>
            <button
              type="button"
              onClick={() => setStep('password')}
              className="text-sm text-slate hover:text-ink"
            >
              &larr; back to password
            </button>
          </div>
        ) : step === 'email' ? (
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
        ) : (
          <form onSubmit={trySignIn} className="mt-6 space-y-4">
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
              placeholder="Password"
              className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full px-4 py-3 rounded-lg bg-ink text-cream font-medium hover:bg-signal transition-colors disabled:opacity-50"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={createAccount}
              disabled={submitting}
              className="w-full px-4 py-3 rounded-lg border border-mist text-slate hover:text-ink hover:border-signal transition-colors disabled:opacity-50"
            >
              Create account with this password
            </button>
            <button
              type="button"
              onClick={sendMagicLink}
              disabled={submitting}
              className="block w-full text-center text-sm text-signal hover:underline"
            >
              Email me a sign-in link instead
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
