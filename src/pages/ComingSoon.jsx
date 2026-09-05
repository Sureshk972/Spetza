import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { trackEvent } from '../lib/analytics.js'

/**
 * Pre-launch landing page for spetza.com.
 *
 * Shown at "/" and "/welcome" to signed-out visitors while VITE_COMING_SOON is
 * on. Every other route stays reachable by direct URL on purpose: /signup and
 * /signin so testing and early couriers still work, and /privacy + /terms
 * because Twilio's A2P crawler checks them and the approved campaign points at
 * this domain.
 *
 * The motif is the two rules under the Spetza wordmark -- green over blue --
 * carried across the page as the route a package travels. Routing is the
 * product, so it earns its place as the one visual idea here.
 */

const ROUTE_STOPS = [
  { label: 'Pickup', detail: 'Post a package from anywhere in the city' },
  { label: 'On route', detail: 'A verified courier already heading that way accepts it' },
  { label: 'Dropoff', detail: 'Handed over the same day, tracked the whole way' },
]

export default function ComingSoon() {
  const [email, setEmail] = useState('')
  const [interest, setInterest] = useState(null)
  const [state, setState] = useState('idle') // idle | saving | done | error
  const [error, setError] = useState('')
  // Bots fill hidden fields; people don't. Cheap, and it costs a real visitor
  // nothing. It is a courtesy filter, not a control -- the database constraints
  // are what actually hold.
  const [trap, setTrap] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (state === 'saving') return

    const clean = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setError("That doesn't look like an email address.")
      setState('error')
      return
    }

    if (trap) {
      // Silently accept and go no further.
      setState('done')
      return
    }

    setState('saving')
    setError('')

    const { error: insertErr } = await supabase
      .from('waitlist_signups')
      .insert({ email: clean, interest })

    // 23505 is a duplicate. Someone signing up twice has done nothing wrong and
    // is already on the list, so tell them the same thing either way.
    if (insertErr && insertErr.code !== '23505') {
      console.error('waitlist signup failed', insertErr)
      setError("We couldn't save that just now. Try again in a moment?")
      setState('error')
      return
    }

    trackEvent('waitlist_joined', { interest: interest || 'unspecified' })
    setState('done')
  }

  return (
    <div className="min-h-full bg-ink text-white">
      {/* Ambient route lines, far back. Purely atmospheric. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 opacity-[0.13]">
        <div className="absolute -left-1/4 top-[18%] h-px w-[150%] rotate-[-14deg] bg-gradient-to-r from-transparent via-green to-transparent" />
        <div className="absolute -left-1/4 top-[19.6%] h-px w-[150%] rotate-[-14deg] bg-gradient-to-r from-transparent via-teal to-transparent" />
        <div className="absolute -left-1/4 bottom-[22%] h-px w-[150%] rotate-[9deg] bg-gradient-to-r from-transparent via-teal to-transparent" />
        <div className="absolute -left-1/4 bottom-[20.4%] h-px w-[150%] rotate-[9deg] bg-gradient-to-r from-transparent via-green to-transparent" />
      </div>

      <div className="relative mx-auto flex min-h-full w-full max-w-lg flex-col px-6 py-14">

        {/* ── Wordmark ── */}
        <svg
          aria-label="Spetza"
          viewBox="0 0 960 350"
          className="h-16 w-auto self-start"
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

        {/* ── Hero ── */}
        <div className="mt-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-green/30 bg-green/10 px-3 py-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-green">
              Chicago · Opening soon
            </span>
          </div>

          <h1 className="mt-6 font-display text-[2.6rem] font-extrabold leading-[1.06] tracking-tight text-balance">
            Same-day delivery,
            <br />
            <span className="text-teal-light">by people already going your way.</span>
          </h1>

          <p className="mt-5 max-w-[52ch] leading-relaxed text-mist/70">
            Spetza matches a package with a nearby courier whose route already passes
            your door. No depots, no next-day promises, no waiting in line.
          </p>
        </div>

        {/* ── The route ── */}
        <ol className="relative mt-11 flex flex-col gap-7 pl-7">
          {/* The line the stops sit on, drawn once behind them. */}
          <span
            aria-hidden="true"
            className="absolute left-[5px] top-2 bottom-2 w-px bg-gradient-to-b from-green via-teal-light to-teal"
          />
          {ROUTE_STOPS.map((stop) => (
            <li key={stop.label} className="relative">
              <span
                aria-hidden="true"
                className="absolute -left-7 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-ink bg-mist ring-1 ring-mist/40"
              />
              <div className="font-display text-sm font-bold uppercase tracking-[0.14em] text-mist/50">
                {stop.label}
              </div>
              <p className="mt-1 leading-snug text-mist/85">{stop.detail}</p>
            </li>
          ))}
        </ol>

        {/* ── Waitlist ── */}
        <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm">
          {state === 'done' ? (
            <div>
              <div className="font-display text-xl font-extrabold text-green">
                You're on the list.
              </div>
              <p className="mt-2 leading-relaxed text-mist/70">
                We'll email you once Spetza opens in your part of Chicago. Nothing else —
                no newsletter, no partner offers.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <label htmlFor="waitlist-email" className="font-display text-lg font-extrabold">
                Get told when we open
              </label>
              <p className="mt-1 text-sm leading-relaxed text-mist/60">
                One email at launch. That's the whole plan.
              </p>

              {/* Honeypot. Hidden from people and from screen readers alike. */}
              <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
                <label htmlFor="waitlist-company">Company</label>
                <input
                  id="waitlist-company"
                  name="company"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={trap}
                  onChange={(e) => setTrap(e.target.value)}
                />
              </div>

              <input
                id="waitlist-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (state === 'error') { setState('idle'); setError('') }
                }}
                aria-invalid={state === 'error'}
                aria-describedby={error ? 'waitlist-error' : undefined}
                className="mt-4 w-full rounded-xl border border-white/15 bg-ink/60 px-4 py-3 text-white placeholder:text-mist/45 outline-none transition-colors focus:border-teal-light focus:ring-2 focus:ring-teal-light/40"
              />

              <fieldset className="mt-4">
                <legend className="text-xs font-bold uppercase tracking-[0.14em] text-mist/55">
                  I'm here to
                </legend>
                <div className="mt-2 flex gap-2">
                  {[
                    { key: 'sender', label: 'Send packages' },
                    { key: 'courier', label: 'Earn as a courier' },
                  ].map((opt) => {
                    const on = interest === opt.key
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setInterest(on ? null : opt.key)}
                        className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors ${
                          on
                            ? 'border-teal-light bg-teal-light/15 text-teal-light'
                            : 'border-white/15 text-mist/70 hover:border-white/30 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              {error && (
                <p id="waitlist-error" role="alert" className="mt-3 text-sm text-green-soft">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={state === 'saving'}
                className="mt-5 w-full rounded-xl bg-green px-4 py-3.5 font-display text-base font-extrabold text-ink transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {state === 'saving' ? 'Adding you…' : 'Join the waitlist'}
              </button>
            </form>
          )}
        </div>

        {/* ── Feet ── */}
        <div className="mt-auto pt-12">
          <p className="text-sm leading-relaxed text-mist/50">
            Already have an account?{' '}
            <Link to="/signin" className="font-bold text-teal-light hover:underline">
              Sign in
            </Link>
          </p>

          <div className="mt-5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-mist/55">
            <Link to="/privacy" className="transition-colors hover:text-mist/80">Privacy Policy</Link>
            <span aria-hidden="true">·</span>
            <Link to="/terms" className="transition-colors hover:text-mist/80">Terms of Service</Link>
            <span aria-hidden="true">·</span>
            <a href="mailto:contact@spetza.com" className="transition-colors hover:text-mist/80">
              contact@spetza.com
            </a>
          </div>

          <p className="mt-3 text-[11px] text-mist/55">
            © 2026 12 Sigma LLC · Spetza is a DBA of 12 Sigma LLC
          </p>
        </div>
      </div>
    </div>
  )
}
