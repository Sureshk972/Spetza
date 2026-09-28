import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAppSetting } from '../hooks/useAppSetting.js'
import { trackEvent } from '../lib/analytics.js'
import { setIntendedRole } from '../lib/intendedRole.js'
import { TIERS, courierTakeFor } from '../lib/pricing.js'
import Footer from '../components/Footer.jsx'

/**
 * Courier recruiting page, spetza.com/drive -- the link in the Craigslist,
 * Facebook and text ads (docs/marketing/courier-recruiting.md). Money first,
 * then the reasons, then how to start. The main /welcome page is unchanged.
 *
 * Earnings come from pricing.js so a tier change can't leave this page quoting
 * old numbers. Both buttons leave a day-long hint so ChooseRole pre-selects
 * Courier; the courier still taps to confirm.
 */

// Darker than the brand green: #76BF6B on white is too faint for the one
// number a courier reads twice.
const MONEY = 'text-[#3f8a36]'

const money = (cents) => `$${(cents / 100).toFixed(2)}`

const EARNINGS = TIERS.map((t, i) => ({
  label: i === 0 ? `Under ${t.upTo} mi` : `${TIERS[i - 1].upTo}–${t.upTo} mi`,
  take: money(courierTakeFor(t.cents)),
}))

const REASONS = [
  { title: 'No shifts, no boss', text: 'Open the app, take the runs that fit your day, ignore the rest.' },
  { title: 'Bike, car, scooter or feet', text: 'However you get around the city already works.' },
  { title: 'Paid in about 2 days', text: 'Straight to your bank through Stripe after every delivery.' },
  { title: 'Packages only', text: 'No food, no waiting on a kitchen, no cold fries to explain.' },
]

function Wordmark() {
  return (
    <svg aria-label="Spetza" viewBox="0 0 960 350" className="mx-auto h-16" xmlns="http://www.w3.org/2000/svg">
      <line x1="43.57" y1="279" x2="934.28" y2="279" stroke="#76bf6b" fill="none" strokeMiterlimit="10" strokeWidth="45" />
      <line x1="43.57" y1="322.76" x2="934.28" y2="322.76" stroke="#0071bc" fill="none" strokeMiterlimit="10" strokeWidth="45" />
      <text fontFamily="'Nunito', sans-serif" fontWeight="900" fontSize="280" fill="currentColor" transform="translate(26.65 238.7)">
        <tspan x="0" y="0">Sp</tspan>
        <tspan x="355.87" y="0">e</tspan>
        <tspan x="510.15" y="0">t</tspan>
        <tspan x="630.55" y="0">z</tspan>
        <tspan x="765.51" y="0">a</tspan>
      </text>
    </svg>
  )
}

function Cta({ position }) {
  return (
    <Link
      to="/signup"
      onClick={() => {
        setIntendedRole('courier')
        trackEvent('courier_splash_cta', { position })
      }}
      className="block w-full py-4 rounded-xl bg-ink text-white text-center font-display font-extrabold text-lg hover:opacity-90 transition-opacity"
    >
      Become a courier
    </Link>
  )
}

function SectionTitle({ children }) {
  return <h2 className="font-display font-extrabold text-2xl text-ink">{children}</h2>
}

export default function Drive() {
  const { value: courierPays } = useAppSetting('courier_pays_background_check', true)

  useEffect(() => {
    trackEvent('courier_splash_viewed')
  }, [])

  const steps = [
    { title: 'Sign up', text: 'About 10 minutes: your phone, a selfie, and a bank account for payouts.' },
    courierPays
      ? { title: 'Background check', text: 'One-time $40 background check — earned back at $1 per delivery.' }
      : { title: 'Background check', text: 'Background check on us — no fee to start.' },
    { title: 'Start taking runs', text: 'Open requests near you show up on your Discover tab. Accept the ones on your way.' },
  ]

  return (
    <div className="min-h-full flex flex-col items-center px-6 py-12">
      <div className="w-full max-w-md">
        {/* Hero */}
        <header className="text-center">
          <Wordmark />
          <p className="mt-6 text-xs uppercase tracking-widest font-bold text-green">Couriers wanted · Chicago</p>
          <h1 className="mt-3 font-display font-black text-4xl leading-tight text-ink">
            Get paid to drive the route you're already driving.
          </h1>
          <p className="mt-4 text-slate leading-relaxed">
            Neighbors post packages that need to get across town. You pick the ones on your way and get paid for each one.
          </p>
          <div className="mt-8">
            <Cta position="hero" />
          </div>
        </header>

        {/* Earnings */}
        <section className="mt-14">
          <SectionTitle>What you earn</SectionTitle>
          <p className="mt-1 text-sm text-slate">What lands in your bank, per delivery.</p>
          <div className="mt-4 rounded-2xl border border-mist bg-white divide-y divide-mist">
            {EARNINGS.map((row) => (
              <div key={row.label} className="flex items-center justify-between px-5 py-3.5">
                <span className="text-ink">{row.label}</span>
                <span className={`font-display font-extrabold text-xl ${MONEY}`}>{row.take}</span>
              </div>
            ))}
          </div>
          <p className={`mt-3 text-sm font-semibold ${MONEY}`}>Plus 100% of tips.</p>
        </section>

        {/* Why */}
        <section className="mt-14">
          <SectionTitle>Why Spetza</SectionTitle>
          <ul className="mt-4 grid gap-3">
            {REASONS.map((r) => (
              <li key={r.title} className="rounded-2xl border border-mist bg-white px-5 py-4">
                <p className="font-bold text-ink">{r.title}</p>
                <p className="mt-1 text-sm text-slate leading-relaxed">{r.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* How to start */}
        <section className="mt-14">
          <SectionTitle>How to start</SectionTitle>
          <ol className="mt-4 grid gap-4">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="flex-none w-9 h-9 rounded-full bg-teal text-white font-display font-extrabold flex items-center justify-center">
                  {i + 1}
                </span>
                <div>
                  <p className="font-bold text-ink">{s.title}</p>
                  <p className="mt-0.5 text-sm text-slate leading-relaxed">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Early perk */}
        <section className="mt-14 rounded-2xl bg-teal/10 px-5 py-5">
          <p className="font-display font-extrabold text-lg text-ink">Get in early</p>
          <p className="mt-1 text-sm text-slate leading-relaxed">
            Launching in Andersonville, Uptown and Edgewater first. Early couriers get first pick of the runs.
          </p>
        </section>

        {/* Footer CTA */}
        <div className="mt-10">
          <Cta position="footer" />
          <p className="mt-4 text-center text-xs text-slate">
            <Link to="/trust" className="underline hover:text-ink">How we vet every courier</Link>
            {' · '}
            <Link to="/faq" className="underline hover:text-ink">Questions</Link>
          </p>
        </div>

        <Footer />
      </div>
    </div>
  )
}
