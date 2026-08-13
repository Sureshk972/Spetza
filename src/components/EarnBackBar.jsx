/**
 * Slim persistent earn-back bar — sits below TopBar in CourierLayout.
 * Shows for all couriers until the $40 is fully earned back.
 *
 * Reads earnback_credited_cents from the profile (set by the
 * apply_earnback_credit DB function on each completed delivery).
 *
 * - Before bg check: teaser CTA linking to /courier/verify
 * - After bg check started: progress bar with $ earned
 * - After $40 earned back: auto-hides
 */
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const FEE = 4000 // cents
const money = (c) => `$${(c / 100).toFixed(0)}`

export default function EarnBackBar() {
  const { profile } = useAuth()

  const bg = profile?.background_check_status ?? 'not_started'
  const isCourier = profile?.account_type === 'courier'
  const rejected = bg === 'rejected'
  const started = bg !== 'not_started' && !rejected

  if (!isCourier || rejected) return null

  // Before bg check — teaser CTA
  if (!started) {
    return (
      <Link
        to="/courier/verify"
        className="block shrink-0 bg-green/5 border-b border-green/20 px-4 py-2"
      >
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <span className="text-xs text-ink">
            <span className="font-medium">Background check · $40</span>
            <span className="text-slate"> — earn $1 back with every delivery</span>
          </span>
          <span className="text-[11px] text-teal whitespace-nowrap">Get verified →</span>
        </div>
      </Link>
    )
  }

  const earned = profile?.earnback_credited_cents ?? 0
  const done = earned >= FEE

  if (done) return null

  const pct = (earned / FEE) * 100

  return (
    <Link
      to="/courier/profile"
      className="block shrink-0 bg-white border-b border-mist px-4 py-1.5"
    >
      <div className="max-w-3xl mx-auto flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full bg-mist overflow-hidden">
          <div
            className="h-full rounded-full bg-green transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[11px] text-slate tabular-nums whitespace-nowrap">
          {money(earned)}/{money(FEE)} earned back
        </span>
      </div>
    </Link>
  )
}
