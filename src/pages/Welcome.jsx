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
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="inline-block px-3 py-1 rounded-full bg-teal/10 text-teal text-xs uppercase tracking-widest font-semibold">
          Peer-to-peer delivery
        </div>
        <h1 className="font-display text-6xl text-ink mt-6 tracking-tight font-black">Spetza</h1>
        <p className="text-teal mt-4 text-lg font-bold">Get it there.</p>
        <p className="text-slate mt-6 leading-relaxed">
          Post a package. A nearby courier picks it up and delivers it.
          No schedules. No depots. Just neighbors moving things for neighbors.
        </p>
        <div className="mt-10 grid gap-3">
          <Link
            to="/signup"
            onClick={() => chooseRole('sender')}
            className="block px-6 py-4 rounded-xl border border-mist bg-white text-ink text-left hover:border-teal transition-colors"
          >
            <div className="text-xs uppercase tracking-widest text-teal font-bold">Sender</div>
            <div className="font-display text-xl mt-1 font-extrabold">I want to send packages</div>
          </Link>
          <Link
            to="/signup"
            onClick={() => chooseRole('courier')}
            className="block px-6 py-4 rounded-xl border border-mist bg-white text-ink text-left hover:border-green transition-colors"
          >
            <div className="text-xs uppercase tracking-widest text-green font-bold">Courier</div>
            <div className="font-display text-xl mt-1 font-extrabold">I want to deliver packages</div>
          </Link>
        </div>
        <p className="text-slate text-xs mt-6">
          Already have an account?{' '}
          <Link to="/signin" className="text-teal hover:underline font-semibold">Sign in</Link>
        </p>
        <p className="text-slate text-xs mt-3">
          <Link to="/trust" className="hover:text-ink underline">How we vet every courier</Link>
        </p>
      </div>

      {/* Legal footer */}
      <footer className="mt-16 text-center text-[11px] text-slate/60">
        © 2026 12 Sigma LLC · Spetza is a DBA of 12 Sigma LLC
      </footer>
    </div>
  )
}
