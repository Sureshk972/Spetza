import { Link } from 'react-router-dom'

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 shrink-0 text-green" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 10.7a1 1 0 1 1 1.4-1.4l3.1 3.1 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
    </svg>
  )
}

function VettingCard({ title, children }) {
  return (
    <div className="p-5 rounded-xl border border-mist bg-white">
      <div className="flex items-start gap-3">
        <Check />
        <div>
          <div className="text-ink font-medium">{title}</div>
          <div className="text-sm text-slate mt-1 leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  )
}

export default function Trust() {
  return (
    <div className="min-h-full px-6 py-14">
      <div className="max-w-xl mx-auto">
        <Link to="/welcome" className="text-sm text-slate hover:text-ink">&larr; back</Link>

        <div className="mt-8">
          <div className="text-xs uppercase tracking-widest text-teal">Trust &amp; Safety</div>
          <h1 className="font-display text-4xl text-ink mt-2 leading-tight">
            Your package, handed to someone you can trust.
          </h1>
          <p className="text-slate mt-4 leading-relaxed">
            Spetza connects you with neighbors who deliver — so we take who those neighbors
            are seriously. Every courier clears three checks <span className="text-ink">before
            they can accept a single delivery</span>.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          <VettingCard title="Verified identity">
            Couriers can't get paid until they pass identity verification through Stripe — the
            same system trusted by millions of businesses. A real, legal name, date of birth,
            and a bank account confirmed to belong to them. No anonymous drop-offs.
          </VettingCard>
          <VettingCard title="Background-checked">
            Every courier passes a criminal background check through Checkr — the same screening
            partner used by Uber, DoorDash, and Instacart — before they can pick up a single
            package. If something's flagged, a real person reviews it. No shortcuts.
          </VettingCard>
          <VettingCard title="A face, not a stranger">
            Each courier adds a photo, so when someone arrives at your door, you already know
            who to expect.
          </VettingCard>
        </div>

        <div className="mt-10">
          <h2 className="font-display text-2xl text-ink">You're protected end to end</h2>
          <ul className="mt-4 space-y-3">
            <li className="flex items-start gap-3">
              <Check />
              <span className="text-sm text-slate leading-relaxed">
                <span className="text-ink">You're only charged when it's delivered.</span> Your
                card is authorized when a courier accepts, and charged only once the package
                actually arrives. No paying up front for a delivery that doesn't happen.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Check />
              <span className="text-sm text-slate leading-relaxed">
                <span className="text-ink">Two-way ratings.</span> You rate every courier and
                they rate you, so the community stays accountable.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Check />
              <span className="text-sm text-slate leading-relaxed">
                <span className="text-ink">We're here if something goes wrong.</span> Real
                support, not a dead end.
              </span>
            </li>
          </ul>
        </div>

        <p className="mt-10 text-slate leading-relaxed">
          Neighbors moving things for neighbors — with the guardrails to make that feel easy.
        </p>

        <div className="mt-8">
          <Link
            to="/signup"
            className="inline-block px-6 py-3 rounded-lg bg-ink text-white font-medium hover:bg-teal-light transition-colors"
          >
            Send a package
          </Link>
        </div>
      </div>
    </div>
  )
}
