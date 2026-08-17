import { Link } from 'react-router-dom'

export default function Terms() {
  return (
    <div className="min-h-full px-6 py-14">
      <div className="max-w-xl mx-auto">
        <Link to="/welcome" className="text-sm text-slate hover:text-ink">&larr; back</Link>

        <h1 className="font-display text-3xl text-ink mt-6">Terms of Service</h1>
        <p className="text-xs text-slate mt-2">Effective August 16, 2026</p>

        <div className="mt-8 space-y-6 text-sm text-slate leading-relaxed">
          <Section title="Agreement">
            By using Spetza (<strong className="text-ink">spetza.com</strong> and related mobile
            applications), you agree to these terms. Spetza is operated by{' '}
            <strong className="text-ink">12 Sigma LLC</strong>. If you do not agree, do not use the service.
          </Section>

          <Section title="What Spetza is">
            Spetza is a peer-to-peer marketplace that connects people who need to send small
            packages (<strong className="text-ink">"Senders"</strong>) with independent couriers
            who deliver them (<strong className="text-ink">"Couriers"</strong>). Spetza is a platform —
            we are not a delivery company, shipping carrier, or logistics provider.
          </Section>

          <Section title="Accounts">
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>You must be at least 18 years old to create an account.</li>
              <li>You must provide accurate information, including a valid phone number and email address.</li>
              <li>You are responsible for all activity under your account.</li>
              <li>Couriers must complete identity verification and a background check through Checkr before accepting deliveries.</li>
            </ul>
          </Section>

          <Section title="Sender responsibilities">
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>Provide accurate pickup and dropoff addresses.</li>
              <li>Provide an accurate description and photo of the package.</li>
              <li>Be available at the pickup location to hand off the package and provide the 4-digit PIN.</li>
              <li>Do not ship prohibited items: hazardous materials, illegal goods, perishable food requiring refrigeration, live animals, firearms, or items exceeding 50 lbs.</li>
            </ul>
          </Section>

          <Section title="Courier responsibilities">
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>Complete the background check and identity verification before accepting deliveries.</li>
              <li>Confirm pickup using the sender's 4-digit PIN.</li>
              <li>Deliver packages in a timely manner and handle them with reasonable care.</li>
              <li>You are an independent contractor, not an employee of Spetza or 12 Sigma LLC. You control your own schedule, routes, and which deliveries you accept.</li>
            </ul>
          </Section>

          <Section title="Pricing and payments">
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>Delivery prices are calculated based on distance and displayed before the sender posts a request.</li>
              <li>Spetza charges a platform fee on each delivery. The fee is shown to the sender at checkout.</li>
              <li>Courier payouts are processed through Stripe and deposited the next business day after delivery completion.</li>
              <li>Tips are optional and go directly to the courier.</li>
              <li>Couriers pay a one-time $40 background check fee, processed through Stripe. This fee is earned back at $1 per completed delivery.</li>
            </ul>
          </Section>

          <Section title="Liability disclaimer">
            <div className="p-4 rounded-lg bg-mist border border-mist mt-2">
              <strong className="text-ink">Spetza is a marketplace, not a carrier.</strong> We connect
              senders with independent couriers. Spetza and 12 Sigma LLC are not liable for:
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Loss, theft, or damage to packages during delivery.</li>
                <li>Delays in pickup or delivery.</li>
                <li>The actions or conduct of senders or couriers.</li>
                <li>The condition or contents of packages.</li>
              </ul>
              <p className="mt-2">
                By posting a delivery request, senders acknowledge that delivery is at their own risk.
                Couriers accept deliveries at their own discretion and liability.
              </p>
            </div>
          </Section>

          <Section title="SMS communications">
            By providing your phone number and verifying it, you consent to receive transactional
            SMS messages related to deliveries, payments, and account security. Message frequency
            varies. Message and data rates may apply. Reply <strong className="text-ink">STOP</strong> to
            opt out or <strong className="text-ink">HELP</strong> for assistance.
          </Section>

          <Section title="Ratings and reviews">
            After a delivery, both senders and couriers may rate each other. Ratings are public.
            Spetza reserves the right to remove ratings that violate our guidelines (harassment,
            spam, or fraudulent content).
          </Section>

          <Section title="Account suspension">
            We may suspend or terminate accounts that violate these terms, engage in fraud,
            receive consistently poor ratings, or fail background checks. We will notify you
            by email if your account is suspended.
          </Section>

          <Section title="Modifications">
            We may update these terms from time to time. Continued use of Spetza after changes
            constitutes acceptance. We will notify you of material changes via email or in-app
            notification.
          </Section>

          <Section title="Governing law">
            These terms are governed by the laws of the State of Illinois. Any disputes will
            be resolved in the courts of Cook County, Illinois.
          </Section>

          <Section title="Contact">
            <a href="mailto:contact@spetza.com" className="text-teal hover:underline">contact@spetza.com</a>
            <div className="mt-1">12 Sigma LLC · Chicago, IL</div>
          </Section>
        </div>

        <div className="mt-12 pt-6 border-t border-mist text-xs text-slate">
          © 2026 12 Sigma LLC · Spetza is a DBA of 12 Sigma LLC
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <h2 className="text-base font-bold text-ink mb-2">{title}</h2>
      <div>{children}</div>
    </div>
  )
}
