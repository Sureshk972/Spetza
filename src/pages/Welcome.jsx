import { Link } from 'react-router-dom'
import { trackEvent } from '../lib/analytics.js'

const chooseRole = (role) => {
  try {
    sessionStorage.setItem('spetza:intended_role', role)
  } catch {
    // sessionStorage can throw in private tabs; fall through — the
    // ChooseRole fallback will still catch these users after signup.
  }
  trackEvent('role_selected', { role })
}

export default function Welcome() {
  return (
    <div className="min-h-full flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="inline-block px-3 py-1 rounded-full bg-mist text-slate text-xs uppercase tracking-widest">
          Peer-to-peer delivery
        </div>
        <h1 className="font-serif text-6xl text-ink mt-6 tracking-tight">Spetza</h1>
        <p className="text-signal mt-4 text-lg">Get it there.</p>
        <p className="text-slate mt-6 leading-relaxed">
          Post a package. A nearby courier picks it up and delivers it.
          No schedules. No depots. Just neighbors moving things for neighbors.
        </p>
        <div className="mt-10 grid gap-3">
          <Link
            to="/signup"
            onClick={() => chooseRole('sender')}
            className="block px-6 py-4 rounded-xl border border-mist text-ink text-left hover:border-signal transition-colors"
          >
            <div className="text-xs uppercase tracking-widest text-signal font-bold">Sender</div>
            <div className="font-serif text-xl mt-1">I want to send packages</div>
          </Link>
          <Link
            to="/signup"
            onClick={() => chooseRole('courier')}
            className="block px-6 py-4 rounded-xl border border-mist text-ink text-left hover:border-signal transition-colors"
          >
            <div className="text-xs uppercase tracking-widest text-signal font-bold">Courier</div>
            <div className="font-serif text-xl mt-1">I want to deliver packages</div>
          </Link>
        </div>
        <p className="text-slate text-xs mt-6">
          Already have an account?{' '}
          <Link to="/signin" className="text-signal hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
