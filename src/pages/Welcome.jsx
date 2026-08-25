import { useState } from 'react'
import { Link } from 'react-router-dom'
import { trackEvent } from '../lib/analytics.js'
import Footer from '../components/Footer.jsx'

/* ── Testimonials ── */
const TESTIMONIALS = [
  // Senders — convenience, speed, ease
  { name: "Marco R.", role: "sender", text: "Posted a package at lunch, it was delivered by dinner. Faster than any shipping service I've used." },
  { name: "David L.", role: "sender", text: "Sent birthday gifts to my sister across town without fighting traffic or standing in line. Brilliant." },
  { name: "James K.", role: "sender", text: "My Etsy shop uses Spetza for same-day local orders. Customers love it and I save on shipping costs." },
  { name: "Rachel W.", role: "sender", text: "Forgot my laptop at a friend's place. Had it back in my hands within an hour. Can't beat that." },
  { name: "Nadia S.", role: "sender", text: "Sent documents that needed a signature across the city. Way cheaper than a courier service and just as fast." },
  { name: "Elena P.", role: "sender", text: "I sell vintage furniture locally. Spetza couriers handle the pickups so I don't need a van." },
  { name: "Linda T.", role: "sender", text: "Returned an online order without driving to the post office. Courier picked it up from my porch." },
  { name: "Omar F.", role: "sender", text: "My mom needed her medication across town. Posted it and a courier had it there in 40 minutes." },
  { name: "Jessica B.", role: "sender", text: "I send samples to clients every week. Spetza replaced my courier contract and costs half as much." },
  { name: "Andre M.", role: "sender", text: "Sold something on Marketplace and the buyer had it same day. They left me a five-star review." },
  { name: "Mei C.", role: "sender", text: "No more waiting in line at the shipping store. I just post it and someone picks it up. So simple." },
  { name: "Patrick O.", role: "sender", text: "Needed a contract signed and returned same day. Spetza made it happen for less than ten dollars." },
  { name: "Hannah J.", role: "sender", text: "I run a small bakery and use Spetza for local deliveries. Customers get warm bread, not day-old packages." },
  { name: "Victor S.", role: "sender", text: "Forgot my charger at the office. Had someone bring it to me at home in under an hour." },
  { name: "Tanya R.", role: "sender", text: "Sent a care package to my daughter at college across town. She had it before her next class." },

  // Couriers — earnings, flexibility, tangible money
  { name: "Aisha T.", role: "courier", text: "I pick up two or three parcels on my commute home. Easy extra income and I'm already driving that way." },
  { name: "Sofia M.", role: "courier", text: "The routing makes it simple — I just accept deliveries along my route. No detours, no wasted time." },
  { name: "Priya N.", role: "courier", text: "Started as a way to cover gas money. Now I'm clearing $400 a week on evenings and weekends." },
  { name: "Carlos G.", role: "courier", text: "Accept, pick up, deliver, get paid. Made $85 yesterday on four deliveries between meetings." },
  { name: "Tyler B.", role: "courier", text: "I deliver on my bike — good exercise and I cleared $60 before lunch on Saturday." },
  { name: "Kevin H.", role: "courier", text: "The verification process gave me confidence, and senders trust me right away. More trust means more tips." },
  { name: "Darius W.", role: "courier", text: "Drove for rideshare before. This pays better per hour and I don't need anyone in my car." },
  { name: "Mia L.", role: "courier", text: "I do three or four pickups on my way home from work. Covers my grocery bill every week." },
  { name: "Ryan J.", role: "courier", text: "Made $120 on a Saturday without planning my day. Just accepted what was on my route." },
  { name: "Fatima A.", role: "courier", text: "I'm a student. Between classes I grab a delivery or two — it's better money than the campus bookstore." },
  { name: "Derek N.", role: "courier", text: "Picked up five packages in one neighbourhood and delivered them all within two miles. $70 in an hour." },
  { name: "Jasmine P.", role: "courier", text: "No boss, no shifts, no schedule. I open the app when I want money and close it when I'm done." },
  { name: "Marcus T.", role: "courier", text: "The payout hits my account next day. No waiting around for a weekly check." },
  { name: "Lena K.", role: "courier", text: "I was skeptical, but my first week I made $300 just driving routes I already drive. Not going back." },
  { name: "Sam D.", role: "courier", text: "Retired and bored. Now I deliver a few packages a day, meet people, and pocket an extra $200 a week." },
]

/* ── Deterministic weekly rotation ── */
function seededShuffle(arr, seed) {
  const shuffled = [...arr]
  let s = seed
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647
    const j = s % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function weeklyTestimonials() {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000
  const week = Math.floor(Date.now() / WEEK_MS)
  const shuffled = seededShuffle(TESTIMONIALS, week)

  // Guarantee at least 3 senders and 3 couriers in the 12
  const senders = shuffled.filter(t => t.role === 'sender')
  const couriers = shuffled.filter(t => t.role === 'courier')
  const picked = [...senders.slice(0, 6), ...couriers.slice(0, 6)]

  // Re-shuffle the picked 12 so roles are interleaved, not grouped
  const result = seededShuffle(picked, week + 1)

  // Assign daysAgo (1–19) so dates spread naturally
  return result.map((t, i) => ({ ...t, daysAgo: i + 1 + Math.floor(i / 2) }))
}

const WEEKLY = weeklyTestimonials()

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
  const visible = showAll ? WEEKLY : WEEKLY.slice(0, 3)
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
    localStorage.setItem('spetza:intended_role', role)
  } catch {
    // localStorage can throw in private tabs; fall through — the
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
            <div className="mt-2 text-xs text-slate leading-relaxed">
              One-time $40 background check — <span className="text-green font-semibold">earn it all back</span>, $1 per delivery.
            </div>
          </Link>
        </div>

        <p className="text-slate text-xs mt-6">
          Already have an account?{' '}
          <Link to="/signin" className="text-teal hover:underline font-semibold">Sign in</Link>
        </p>
        <p className="text-slate text-xs mt-3">
          <Link to="/trust" className="hover:text-ink underline">How we vet every courier</Link>
          {' · '}
          <Link to="/faq" className="hover:text-ink underline">Questions</Link>
        </p>

        {/* Reviews */}
        <section className="mt-12 text-left">
          <h2 className="font-display text-lg font-extrabold text-ink mb-4 text-center">
            What people are saying
          </h2>
          <Testimonials />
        </section>
      </div>

      <Footer />
    </div>
  )
}
