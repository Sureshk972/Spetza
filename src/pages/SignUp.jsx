import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { trackEvent, identifyUser } from '../lib/analytics.js'
import Footer from '../components/Footer.jsx'

export default function SignUp() {
  const { user, refreshProfile } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])
  const [step, setStep] = useState('email') // 'email' | 'password'
  const [email, setEmail] = useState('')
  // Terms/Privacy acceptance only. SMS consent deliberately does NOT live on
  // this page: A2P 10DLC forbids making it a condition of account creation,
  // and reviewers require the consent to sit beside a phone number field.
  // It is collected as an optional opt-in on /verify-phone instead.
  const [termsAccepted, setTermsAccepted] = useState(false)
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

  const createAccount = async (e) => {
    e.preventDefault()
    if (!email || !password || !requireConfig()) return
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters.')
      return
    }
    if (!termsAccepted) {
      toast.error('Please accept the Terms of Service and Privacy Policy.')
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

    // If Supabase is configured to require email confirmation, signUp
    // returns a user but no session. Tell the user explicitly instead
    // of stranding them on a spinning form.
    if (data?.user && !data?.session) {
      setSubmitting(false)
      toast.success(
        `Check ${email} for a confirmation link. Come back here after clicking it.`,
        { duration: 8000 },
      )
      setStep('email')
      setPassword('')
      return
    }

    // Write a profile row right away (before any navigation). RequireAuth
    // only gates on phone-verified / name-captured when `profile` is
    // non-null — with no row yet, a fresh signup falls straight through
    // to /choose-role, skipping phone verification entirely.
    //
    // The row deliberately carries NO account_type. Baking the stashed role
    // in here used to save a tap, but it also settled the role before anyone
    // was asked and left ChooseRole with nothing to do, so it redirected past
    // itself -- two couriers signed up as senders and never saw the question.
    // ChooseRole now uses the stash to pre-select and waits for a real tap.
    if (data?.user?.id && data?.session) {
      const patch = { id: data.user.id, updated_at: new Date().toISOString() }
      const { error: profileErr } = await supabase.from('profiles').upsert(patch)
      if (profileErr) {
        console.error('Failed to create profile row after signup', profileErr)
      }

      // Pull the row we just wrote into context. The onAuthStateChange
      // fired by signUp() raced ahead of this upsert and cached a null
      // profile; without this refetch the guards see "no profile" and let
      // the dashboard render before bouncing to /verify-phone.
      await refreshProfile()

      // Tie all subsequent events to this user and seed the profile.
      identifyUser(data.user.id, { email })
      trackEvent('signup_completed')
    }
    setSubmitting(false)
  }

  return (
    <div className="min-h-full flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Link to="/welcome" className="text-sm text-slate hover:text-ink">
          &larr; back
        </Link>
        <h1 className="font-display text-3xl text-ink mt-6">Create an account</h1>
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
                className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-teal focus:outline-none"
              />
              <button
                type="submit"
                className="w-full px-4 py-3 rounded-lg bg-ink text-white font-medium hover:bg-teal-light transition-colors"
              >
                Continue
              </button>
            </form>
            <p className="text-slate text-sm text-center mt-6">
              Already have an account?{' '}
              <Link to="/signin" className="text-teal hover:underline">Sign in</Link>
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
                  className="text-xs text-teal hover:underline"
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
                className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-teal focus:outline-none"
              />
              <label className="flex items-start gap-3 p-3 rounded-lg border border-mist bg-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 accent-teal shrink-0"
                />
                <span className="text-xs text-slate leading-relaxed">
                  I agree to the{' '}
                  <Link to="/terms" target="_blank" className="text-teal hover:underline">Terms of Service</Link>
                  {' '}and{' '}
                  <Link to="/privacy" target="_blank" className="text-teal hover:underline">Privacy Policy</Link>.
                </span>
              </label>
              <button
                type="submit"
                disabled={submitting || !termsAccepted}
                className="w-full px-4 py-3 rounded-lg bg-ink text-white font-medium hover:bg-teal-light transition-colors disabled:opacity-50"
              >
                {submitting ? 'Creating…' : 'Create account'}
              </button>
            </form>
            <p className="text-slate text-sm text-center mt-6">
              Already have an account?{' '}
              <Link to="/signin" className="text-teal hover:underline">Sign in</Link>
            </p>
          </>
        )}
        <Footer />
      </div>
    </div>
  )
}
