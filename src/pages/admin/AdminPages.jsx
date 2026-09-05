import { useAuth } from '../../context/AuthContext.jsx'

/**
 * Every page in Spetza, grouped by who it belongs to.
 *
 * Two things stop this being a plain list of links, and both are why each row
 * carries a status rather than just an anchor:
 *
 * 1. Role gating ignores admin. `RequireRole` compares `profiles.account_type`
 *    to the route's role and redirects on a mismatch — being an admin is not a
 *    pass. So a sender-admin opening a /courier page lands on /sender instead,
 *    silently. Rows the viewer cannot reach say so instead of pretending.
 * 2. Some routes need an id. `/sender/requests/:id` is meaningless without one,
 *    so those rows point at the admin list where an id can be found.
 *
 * Links open in a new tab so this page keeps its place.
 */

const GROUPS = [
  {
    name: 'Public',
    blurb: 'No account needed. Anyone with the link can open these.',
    role: null,
    pages: [
      { path: '/welcome', name: 'Welcome', desc: 'The marketing page. What senders get, what couriers earn, and one Get started button.' },
      { path: '/signup', name: 'Create an account', desc: 'Email and password. Writes no role — that is asked later.' },
      { path: '/signin', name: 'Sign in', desc: 'Email first, then password or a magic link.' },
      { path: '/reset-password', name: 'Reset password', desc: 'Where the forgotten-password email lands.' },
      { path: '/trust', name: 'Trust & Safety', desc: 'How couriers are vetted. Linked from the footer everywhere.' },
      { path: '/faq', name: 'FAQ', desc: 'Common questions for both sides of the marketplace.' },
      { path: '/privacy', name: 'Privacy Policy', desc: 'Served as static HTML, not through the app, so Twilio’s A2P crawler can read it.' },
      { path: '/terms', name: 'Terms of Service', desc: 'Also static HTML, for the same reason.' },
    ],
  },
  {
    name: 'Signing up',
    blurb: 'The steps between creating an account and reaching a dashboard. Each one redirects once it is done, so they are only reachable mid-signup.',
    role: null,
    pages: [
      { path: '/verify-phone', name: 'Verify your phone', desc: 'Twilio Verify OTP, plus the optional SMS consent box. Nobody gets past here unverified.' },
      { path: '/name', name: 'Your name', desc: 'First and last name. Sets no role — that used to happen here and caused couriers to be signed up as senders.' },
      { path: '/choose-role', name: 'Choose role', desc: 'The one place account_type is written. Asked once, out loud.' },
      { path: '/', name: 'Root', desc: 'Not a page. Sends a signed-in person to their dashboard and everyone else to Welcome.' },
    ],
  },
  {
    name: 'Sender',
    blurb: 'Only reachable by an account whose role is sender.',
    role: 'sender',
    pages: [
      { path: '/sender', name: 'Sender home', desc: 'Open and active requests, with live updates as couriers accept.' },
      { path: '/sender/new', name: 'Post a delivery', desc: 'Addresses, package photo, distance-based price and route map.' },
      { path: '/sender/inbox', name: 'Sender inbox', desc: 'Notifications about the sender’s own deliveries.' },
      { path: '/sender/profile', name: 'Sender profile', desc: 'Saved card, rating summary, SMS consent, account deletion.' },
      { path: '/sender/requests/:id', name: 'Request detail', desc: 'One delivery: status, route, courier, timeline, payment breakdown, cancel and rating.', needsId: 'a delivery', findAt: '/admin/deliveries' },
      { path: '/sender/requests/:id/edit', name: 'Edit request', desc: 'Change an open request before anyone accepts it.', needsId: 'a delivery', findAt: '/admin/deliveries' },
    ],
  },
  {
    name: 'Courier',
    blurb: 'Only reachable by an account whose role is courier.',
    role: 'courier',
    pages: [
      { path: '/courier', name: 'Courier home', desc: 'Open requests within the service radius, plus deliveries already accepted.' },
      { path: '/courier/verify', name: 'Identity verification', desc: 'Selfie and both sides of an ID, into the private verification bucket.' },
      { path: '/courier/inbox', name: 'Courier inbox', desc: 'Notifications about jobs and payouts.' },
      { path: '/courier/profile', name: 'Courier profile', desc: 'Stripe payout status, service area, earnings, background check state.' },
      { path: '/courier/deliveries/:id', name: 'Delivery detail', desc: 'One job: sender, route, your take, pickup PIN entry, deliver and abandon.', needsId: 'a delivery', findAt: '/admin/deliveries' },
    ],
  },
  {
    name: 'Admin',
    blurb: 'Gated on profiles.is_admin. Role does not matter here.',
    role: 'admin',
    pages: [
      { path: '/admin', name: 'Dashboard', desc: 'Headline counts across users, deliveries and money.' },
      { path: '/admin/users', name: 'Users', desc: 'Every account, filterable by role, with verification and check status.' },
      { path: '/admin/users/:id', name: 'User detail', desc: 'One account in full, with admin actions.', needsId: 'a user', findAt: '/admin/users' },
      { path: '/admin/deliveries', name: 'Deliveries', desc: 'Every delivery and its status.' },
      { path: '/admin/deliveries/:id', name: 'Delivery detail', desc: 'One delivery end to end, from an operator’s view.', needsId: 'a delivery', findAt: '/admin/deliveries' },
      { path: '/admin/payments', name: 'Payments', desc: 'Charges, platform fees, courier payouts, and the card dispute queue.' },
      { path: '/admin/verifications', name: 'Verifications', desc: 'Courier ID queue. Approve or reject.' },
      { path: '/admin/ratings', name: 'Ratings', desc: 'Every rating left by either side.' },
      { path: '/admin/reports', name: 'Reports', desc: 'Problems reported against deliveries.' },
      { path: '/admin/demand', name: 'Demand map', desc: 'Heat map of where deliveries are being posted.' },
      { path: '/admin/waitlist', name: 'Waitlist', desc: 'Sign-ups from the coming-soon page, split by sender and courier interest.' },
      { path: '/admin/pages', name: 'All pages', desc: 'This page. Every route in Spetza, grouped by who it belongs to.' },
    ],
  },
]

function Row({ page, reachable, blockedNote }) {
  const openable = !page.needsId && reachable

  return (
    <div className="px-4 py-3 border-b border-slate/10 last:border-b-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          {openable ? (
            <a
              href={page.path}
              target="_blank"
              rel="noreferrer"
              className="font-display font-bold text-ink hover:text-teal transition-colors"
            >
              {page.name}
            </a>
          ) : (
            <span className="font-display font-bold text-slate">{page.name}</span>
          )}
          <code className="text-xs text-slate/70">{page.path}</code>
        </div>
        <p className="text-sm text-slate mt-0.5 leading-snug">{page.desc}</p>

        {page.needsId && (
          <p className="text-xs text-slate/70 mt-1">
            Needs {page.needsId} id —{' '}
            <a href={page.findAt} target="_blank" rel="noreferrer" className="text-teal hover:underline">
              pick one here
            </a>
            .
          </p>
        )}
        {!reachable && blockedNote && (
          <p className="text-xs text-amber-700 mt-1">{blockedNote}</p>
        )}
      </div>
    </div>
  )
}

export default function AdminPages() {
  const { profile } = useAuth()
  const myRole = profile?.account_type ?? null

  return (
    <div>
      <h1 className="font-display text-3xl font-black text-ink">All pages</h1>
      <p className="text-sm text-slate mt-1 mb-6">
        Every page in Spetza, grouped by who it belongs to. Links open in a new tab.
      </p>

      <div className="flex flex-col gap-6">
        {GROUPS.map((group) => {
          // Role gating ignores admin: a sender-admin opening a courier page is
          // redirected to /sender. Say that on the rows rather than hand over a
          // link that quietly does nothing.
          const reachable =
            group.role === null || group.role === 'admin' || group.role === myRole
          const blockedNote =
            group.role && group.role !== 'admin' && group.role !== myRole
              ? `You are signed in as a ${myRole ?? 'role-less account'}, so this redirects to /${myRole ?? 'choose-role'}. Being an admin does not bypass it.`
              : null

          return (
            <section key={group.name}>
              <div className="flex items-baseline gap-2 flex-wrap">
                <h2 className="font-display text-lg font-extrabold text-ink">{group.name}</h2>
                <span className="text-xs text-slate/70">{group.pages.length} pages</span>
                {!reachable && (
                  <span className="text-[11px] uppercase tracking-widest font-bold text-amber-700">
                    not reachable as you
                  </span>
                )}
              </div>
              <p className="text-sm text-slate mt-1 mb-3 max-w-2xl leading-snug">{group.blurb}</p>

              <div className="bg-white border border-slate/10 rounded-xl overflow-hidden">
                {group.pages.map((page) => (
                  <Row
                    key={page.path}
                    page={page}
                    reachable={reachable}
                    blockedNote={blockedNote}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <p className="text-xs text-slate/70 mt-8 max-w-2xl leading-relaxed">
        Any URL that matches nothing redirects to the root rather than rendering a blank
        page, so a typo will not look like a crash.
      </p>
    </div>
  )
}
