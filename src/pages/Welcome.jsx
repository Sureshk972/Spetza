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
        {/* Hero badge */}
        <div className="inline-block px-4 py-1.5 rounded-full bg-teal text-white text-xs uppercase tracking-widest font-bold">
          Peer-to-peer delivery
        </div>

        {/* Logo */}
        <svg
          aria-label="Spetza"
          viewBox="0 0 960 350"
          className="mx-auto mt-6 h-24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <line x1="43.57" y1="279" x2="934.28" y2="279" stroke="#76bf6b" fill="none" strokeMiterlimit="10" strokeWidth="45" />
          <line x1="43.57" y1="322.76" x2="934.28" y2="322.76" stroke="#0071bc" fill="none" strokeMiterlimit="10" strokeWidth="45" />
          <text
            fontFamily="'Nunito', sans-serif"
            fontWeight="900"
            fontSize="280"
            fill="currentColor"
            transform="translate(26.65 238.7)"
          >
            <tspan x="0" y="0">Sp</tspan>
            <tspan x="355.87" y="0">e</tspan>
            <tspan x="510.15" y="0">t</tspan>
            <tspan x="630.55" y="0">z</tspan>
            <tspan x="765.51" y="0">a</tspan>
          </text>
        </svg>

        {/* Tagline with teal accent bar */}
        <div className="flex items-center justify-center gap-3 mt-4">
          <span className="h-px w-8 bg-teal/40" />
          <p className="text-teal text-lg font-bold italic">Get it there.</p>
          <span className="h-px w-8 bg-teal/40" />
        </div>

        <p className="text-slate mt-6 leading-relaxed">
          Post a package. A nearby courier picks it up and delivers it.
          No schedules. No depots. Just neighbors moving things for neighbors.
        </p>

        {/* Role cards */}
        <div className="mt-10 grid gap-3">
          <Link
            to="/signup"
            onClick={() => chooseRole('sender')}
            className="group block px-6 py-5 rounded-xl border-2 border-teal/20 bg-white text-left hover:border-teal hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-teal/10 text-teal">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </span>
              <div className="text-xs uppercase tracking-widest text-teal font-bold">Sender</div>
            </div>
            <div className="font-display text-xl mt-2 font-extrabold text-ink group-hover:text-teal transition-colors">
              I want to send packages
            </div>
          </Link>
          <Link
            to="/signup"
            onClick={() => chooseRole('courier')}
            className="group block px-6 py-5 rounded-xl border-2 border-green/20 bg-white text-left hover:border-green hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-green/10 text-green">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </span>
              <div className="text-xs uppercase tracking-widest text-green font-bold">Courier</div>
            </div>
            <div className="font-display text-xl mt-2 font-extrabold text-ink group-hover:text-green transition-colors">
              I want to deliver packages
            </div>
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
