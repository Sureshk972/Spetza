import { Link } from 'react-router-dom'

export default function Privacy() {
  return (
    <div className="min-h-full px-6 py-14">
      <div className="max-w-xl mx-auto">
        <Link to="/welcome" className="text-sm text-slate hover:text-ink">&larr; back</Link>

        <h1 className="font-display text-3xl text-ink mt-6">Privacy Policy</h1>
        <p className="text-xs text-slate mt-2">Effective August 16, 2026</p>

        <div className="mt-8 space-y-6 text-sm text-slate leading-relaxed">
          <Section title="Who we are">
            Spetza is operated by <strong className="text-ink">12 Sigma LLC</strong>, a privately held company.
            This policy applies to the Spetza website (<strong className="text-ink">spetza.com</strong>) and
            mobile applications.
          </Section>

          <Section title="What we collect">
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li><strong className="text-ink">Account information</strong> — name, email address, phone number, and a profile photo when you create an account.</li>
              <li><strong className="text-ink">Identity verification</strong> — for couriers, we collect a selfie and submit your information to Checkr, our background-check provider, who processes it under their own privacy policy.</li>
              <li><strong className="text-ink">Location data</strong> — pickup and dropoff addresses for deliveries, and a courier's service area (city and radius).</li>
              <li><strong className="text-ink">Payment information</strong> — processed and stored by Stripe. We do not store card numbers, bank account numbers, or other financial credentials on our servers.</li>
              <li><strong className="text-ink">Delivery data</strong> — package descriptions, photos, order history, ratings, and delivery status updates.</li>
              <li><strong className="text-ink">Device and usage data</strong> — browser type, IP address, and basic analytics to improve the service.</li>
            </ul>
          </Section>

          <Section title="How we use your information">
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>To operate the delivery marketplace — matching senders with couriers, processing payments, and facilitating handoffs.</li>
              <li>To send transactional notifications — SMS, email, and push notifications about delivery status, payment confirmations, and account security.</li>
              <li>To verify courier identity and safety through background checks.</li>
              <li>To improve our service and fix problems.</li>
              <li>To comply with legal obligations.</li>
            </ul>
          </Section>

          <Section title="SMS notifications">
            When you provide your phone number and verify it, you consent to receive delivery-related
            SMS notifications including new delivery alerts, status updates, and payment confirmations.
            Message frequency varies based on delivery activity. Message and data rates may apply.
            <div className="mt-3 p-3 rounded-lg bg-mist border border-mist">
              <strong className="text-ink">To opt out:</strong> reply <strong className="text-ink">STOP</strong> to
              any message, or disable SMS notifications in your profile settings. Reply{' '}
              <strong className="text-ink">HELP</strong> for support.
            </div>
          </Section>

          <Section title="Who we share data with">
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li><strong className="text-ink">Your counterparty</strong> — senders see a courier's first name and photo; couriers see pickup/dropoff addresses and package details.</li>
              <li><strong className="text-ink">Stripe</strong> — for payment processing and courier payouts.</li>
              <li><strong className="text-ink">Checkr</strong> — for courier background checks.</li>
              <li><strong className="text-ink">Twilio</strong> — for SMS notifications and phone verification.</li>
              <li><strong className="text-ink">Resend</strong> — for transactional email.</li>
            </ul>
            <p className="mt-3">
              We do not sell your personal information. We do not share your data with third parties
              for marketing purposes.
            </p>
          </Section>

          <Section title="Data retention">
            We retain your account data while your account is active. Delivery records are kept
            for accounting and dispute resolution. You can request account deletion by emailing{' '}
            <a href="mailto:contact@spetza.com" className="text-teal hover:underline">contact@spetza.com</a>.
          </Section>

          <Section title="Security">
            We use industry-standard measures to protect your data, including encrypted connections
            (TLS), secure authentication, and role-based access controls. Payment data is handled
            entirely by Stripe and never touches our servers.
          </Section>

          <Section title="Your rights">
            You may access, correct, or delete your personal information at any time through your
            profile settings or by contacting us. California residents have additional rights under
            the CCPA — contact us to exercise them.
          </Section>

          <Section title="Changes to this policy">
            We may update this policy from time to time. We will notify you of material changes
            via email or in-app notification.
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
