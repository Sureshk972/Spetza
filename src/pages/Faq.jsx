// Role-specific FAQ.
//
// Every answer here describes behaviour the app actually has today. Where a
// policy is unflattering -- we don't insure packages, your first payout takes
// a fortnight -- it says so plainly rather than in a way a courier or sender
// would feel misled by later. If a flow changes, this page changes with it.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import Footer from '../components/Footer.jsx'
import PricingTable from '../components/PricingTable.jsx'

const SENDER_FAQS = [
  {
    q: 'What is Spetza, and where does it work?',
    a: (
      <>
        Spetza is a marketplace for local package delivery in <strong className="text-ink">Chicago</strong>.
        You post a package, a nearby courier accepts it, picks it up, and takes it where it needs to go.
        There are no depots and no schedules — just people already heading that way.
      </>
    ),
  },
  {
    q: 'What can I send?',
    a: (
      <>
        Anything legal that one person can carry and that weighs under 20 lb. Not allowed:
        hazardous materials, illegal goods, food that needs refrigeration, live animals, or firearms.
        Full list in the{' '}
        <Link to="/terms" className="text-teal hover:underline">Terms of Service</Link>.
      </>
    ),
  },
  {
    q: 'How much does it cost?',
    a: (
      <>
        Price is set by distance, so you know it before you post — no surge, no bidding, no
        haggling with a courier. A service fee is added on top, shown below and again on the
        posting screen before you confirm.
        <div className="mt-3">
          <PricingTable variant="sender" />
        </div>
      </>
    ),
  },
  {
    q: 'When am I charged?',
    a: (
      <>
        Your card is authorized when a courier accepts, and charged only once the package is
        actually delivered. If the delivery never happens, the hold is released and you pay nothing.
      </>
    ),
  },
  {
    q: 'Who is picking up my package?',
    a: (
      <>
        Someone who cleared three checks before they could accept a single delivery: a criminal
        background check through Checkr, identity and bank verification through Stripe, and a
        profile photo so you know who to expect at the door. More on{' '}
        <Link to="/trust" className="text-teal hover:underline">how we vet couriers</Link>.
      </>
    ),
  },
  {
    q: 'How does the handoff work?',
    a: (
      <>
        When your courier arrives you'll get a 4-digit pickup code. They can't mark the package
        collected until you read it to them, so nobody can claim a pickup that didn't happen.
      </>
    ),
  },
  {
    q: "What if nobody's there when it's dropped off?",
    a: (
      <>
        You decide that when you post, not the courier. Choose <em>leave it at the door</em> and
        they'll leave it somewhere safe and photograph exactly where. Choose{' '}
        <em>bring it back to me</em> and they'll return it to you — you'll get a return code to
        hand over when they do. Either way the price is the same, so your courier has no reason
        to ignore what you asked for.
      </>
    ),
  },
  {
    q: 'How do I know it arrived?',
    a: (
      <>
        You're notified when your courier accepts, arrives, collects, and delivers. Every completed
        delivery includes a photo of the drop — a courier can't close one without it.
      </>
    ),
  },
  {
    q: 'Can I cancel?',
    a: (
      <>
        Yes, any time before the package is picked up. The payment hold is released and you're not
        charged. Once it's collected and in transit, get in touch and we'll help sort it out.
      </>
    ),
  },
  {
    q: "What if my package is lost or damaged?",
    a: (
      <>
        Tell us as soon as you notice and we'll help you piece together what happened — we can see
        the delivery record, the pickup code, and the photo taken at the drop.
        <br /><br />
        Being straight with you: Spetza is a marketplace rather than a carrier, so we don't insure
        packages against loss or damage, and the{' '}
        <Link to="/terms" className="text-teal hover:underline">Terms</Link> put that risk with you.
        What we do instead is make every step verifiable — vetted couriers, a code at pickup, a
        photo at drop-off. For anything irreplaceable, choose <em>bring it back to me</em> and hand
        it over in person rather than leaving it at a door.
      </>
    ),
  },
]

const COURIER_FAQS = [
  {
    q: 'How do I start delivering?',
    a: (
      <>
        Sign up, verify your phone, add a photo, connect a bank account through Stripe, and pass a
        background check. Once those are done, open deliveries near you appear in the app.
      </>
    ),
  },
  {
    q: 'What does the background check cost?',
    a: (
      <>
        <strong className="text-ink">$40, once</strong> — and you earn all of it back at $1 per
        completed delivery. After 40 deliveries the full $40 is covered. You pay it up front, before
        you've earned anything, which we know is the least fun part of starting.
      </>
    ),
  },
  {
    q: 'Do I need a car?',
    a: (
      <>
        No. Bike, car, on foot — whatever gets the package there. Deliveries show their distance so
        you can judge what's realistic for how you're travelling.
      </>
    ),
  },
  {
    q: 'How much does a delivery pay?',
    a: (
      <>
        By distance, and you see the figure before you accept anything. A platform fee comes out
        of each delivery — the rates below are what reaches you.
        <div className="mt-3">
          <PricingTable variant="courier" />
        </div>
      </>
    ),
  },
  {
    q: 'How do I choose what to deliver?',
    a: (
      <>
        You see what's open near you and accept only what suits your route. Nothing is assigned to
        you, there are no shifts, and declining costs you nothing.
      </>
    ),
  },
  {
    q: 'When do I actually get paid?',
    a: (
      <>
        Your earnings land in your Stripe balance the moment you close a delivery. Stripe then moves
        them to your bank in <strong className="text-ink">about 2 business days</strong>.
        <br /><br />
        Your <strong className="text-ink">first payout is slower — up to 14 days</strong> — while
        Stripe finishes verifying your account. That's Stripe's hold on new accounts, not us sitting
        on your money, but it's real and worth planning around before your first week.
      </>
    ),
  },
  {
    q: "What if nobody's at the dropoff?",
    a: (
      <>
        The sender chose what happens before you ever picked it up, and you'll see their instruction
        on the dropoff screen. Either leave it somewhere safe and photograph where, or bring it back
        to them and enter the return code they give you.{' '}
        <strong className="text-ink">A return pays the same as a delivery</strong> — following the
        sender's instruction never costs you money.
      </>
    ),
  },
  {
    q: 'Why do I have to take a photo?',
    a: (
      <>
        Because it protects you. If a sender later says a package never arrived, the photo of where
        you left it is your evidence. You can't close a delivery without one, and the sender sees it.
      </>
    ),
  },
  {
    q: "What if I can't finish a delivery?",
    a: (
      <>
        Release it before pickup and it goes back to the open list for another courier — no penalty,
        and the sender's payment hold is released. Once you've collected a package, get in touch
        rather than abandoning it.
      </>
    ),
  },
  {
    q: 'Do I get rated?',
    a: (
      <>
        Yes, and so do senders. Both sides rate each other after a delivery, and your average shows
        on your profile. It's how the good couriers become obvious.
      </>
    ),
  },
]

function FaqItem({ q, a, open, onToggle }) {
  return (
    <div className="border border-mist rounded-xl bg-white overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-start justify-between gap-4 px-5 py-4 text-left hover:bg-mist/40 transition-colors"
      >
        <span className="text-sm font-medium text-ink">{q}</span>
        <span className={`shrink-0 text-slate transition-transform ${open ? 'rotate-45' : ''}`} aria-hidden="true">
          +
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 -mt-1 text-sm text-slate leading-relaxed">{a}</div>
      )}
    </div>
  )
}

export default function Faq() {
  const [role, setRole] = useState('sender')
  // Index of the open item, scoped per role so switching tabs doesn't leave
  // an unrelated answer expanded.
  const [openIndex, setOpenIndex] = useState(0)

  const faqs = role === 'sender' ? SENDER_FAQS : COURIER_FAQS

  const switchRole = (next) => {
    setRole(next)
    setOpenIndex(0)
  }

  return (
    <div className="min-h-full px-6 py-14">
      <div className="max-w-xl mx-auto">
        <Link to="/welcome" className="text-sm text-slate hover:text-ink">&larr; back</Link>

        <div className="mt-8">
          <div className="text-xs uppercase tracking-widest text-teal">Questions</div>
          <h1 className="font-display text-4xl text-ink mt-2 leading-tight">
            The things people ask us.
          </h1>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-2 p-1 rounded-xl bg-mist">
          {[
            { key: 'sender', label: 'I send packages' },
            { key: 'courier', label: 'I deliver packages' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => switchRole(tab.key)}
              className={`py-2.5 rounded-lg text-sm font-medium transition-colors ${
                role === tab.key
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-slate hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3">
          {faqs.map((f, i) => (
            <FaqItem
              key={f.q}
              q={f.q}
              a={f.a}
              open={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? -1 : i)}
            />
          ))}
        </div>

        <div className="mt-10 p-5 rounded-xl border border-mist bg-white">
          <div className="text-sm text-ink font-medium">Still stuck?</div>
          <p className="text-sm text-slate mt-1 leading-relaxed">
            Email{' '}
            <a href="mailto:contact@spetza.com" className="text-teal hover:underline">
              contact@spetza.com
            </a>{' '}
            and a person will answer.
          </p>
        </div>

        <div className="mt-8">
          <Link
            to="/signup"
            className="inline-block px-6 py-3 rounded-lg bg-ink text-white font-medium hover:bg-teal-light transition-colors"
          >
            Get started
          </Link>
        </div>

        <Footer />
      </div>
    </div>
  )
}
