import { useState } from 'react'
import { Link } from 'react-router-dom'
import { trackEvent } from '../lib/analytics.js'

/* ── Testimonials ── */
const TESTIMONIALS = [
  { name: "Marco R.", role: "sender", daysAgo: 1, text: "Posted a package at lunch, it was delivered by dinner. Faster than any shipping service I've used." },
  { name: "Aisha T.", role: "courier", daysAgo: 2, text: "I pick up two or three parcels on my commute home. Easy extra income and I'm already driving that way." },
  { name: "David L.", role: "sender", daysAgo: 3, text: "Sent birthday gifts to my sister across town without fighting traffic or standing in line. Brilliant." },
  { name: "Sofia M.", role: "courier", daysAgo: 4, text: "The routing makes it simple — I just accept deliveries along my route. No detours, no wasted time." },
  { name: "James K.", role: "sender", daysAgo: 5, text: "My Etsy shop uses Spetza for same-day local orders. Customers love it and I save on shipping costs." },
  { name: "Priya N.", role: "courier", daysAgo: 7, text: "Started as a way to cover gas money. Now I'm earning real income on weekends just driving around my neighbourhood." },
  { name: "Rachel W.", role: "sender", daysAgo: 9, text: "Forgot my laptop at a friend's place. Had it back in my hands within an hour. Can't beat that." },
  { name: "Carlos G.", role: "courier", daysAgo: 11, text: "The app is dead simple. Accept, pick up, deliver, get paid. No complicated scheduling." },
  { name: "Nadia S.", role: "sender", daysAgo: 13, text: "Sent documents that needed a signature across the city. Way cheaper than a courier service and just as fast." },
  { name: "Tyler B.", role: "courier", daysAgo: 15, text: "I deliver on my bike — good exercise and good money. Win-win." },
  { name: "Elena P.", role: "sender", daysAgo: 17, text: "I sell vintage furniture locally. Spetza couriers handle the pickups so I don't need a van." },
  { name: "Kevin H.", role: "courier", daysAgo: 19, text: "The verification process gave me confidence, and senders trust me right away. Smart system." },
]

function reviewDate(daysAgo) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Stars() {
  return (
    <div className="flex gap-0.5" aria-label="5 out of 5 stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width="14" height="14" viewBox="0 0 14 14" fill="#0378A6" aria-hidden="true">
          <path d="M7 1L8.8 4.7L13 5.3L10 8.2L10.7 12.3L7 10.4L3.3 12.3L4 8.2L1 5.3L5.2 4.7L7 1Z" />
        </svg>
      ))}
    </div>
  )
}

function Testimonials() {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? TESTIMONIALS : TESTIMONIALS.slice(0, 3)
  return (
    <div className="flex flex-col gap-3">
      {visible.map((t, i) => (
        <div key={i} className="bg-white border border-slate/10 rounded-2xl p-4 text-left">
          <div className="flex items-center justify-between mb-2">
            <Stars />
            <span className="text-xs text-slate/60">{reviewDate(t.daysAgo)}</span>
          </div>
          <p className="text-sm text-ink leading-relaxed mb-2">
            "{t.text}"
          </p>
          <p className="text-xs text-slate/60">
            {t.name} · <span className={t.role === 'sender' ? 'text-teal' : 'text-green'}>{t.role === 'sender' ? 'Sender' : 'Courier'}</span>
          </p>
        </div>
      ))}
      {!showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-sm bg-transparent border-none py-2 cursor-pointer underline underline-offset-4 text-teal hover:text-teal/80 transition-colors"
        >
          See all reviews →
        </button>
      )}
    </div>
  )
}

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

        {/* Reviews */}
        <section className="mt-12 text-left">
          <h2 className="font-display text-lg font-extrabold text-ink mb-4 text-center">
            What people are saying
          </h2>
          <Testimonials />
        </section>
      </div>

      {/* Legal footer */}
      <footer className="mt-16 text-center text-[11px] text-slate/60">
        © 2026 12 Sigma LLC · Spetza is a DBA of 12 Sigma LLC
      </footer>
    </div>
  )
}
