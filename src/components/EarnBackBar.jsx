/**
 * Slim persistent earn-back bar — sits below TopBar in CourierLayout.
 * Shows for all couriers until the $40 is fully earned back.
 *
 * - Before bg check: teaser CTA linking to /courier/verify
 * - After bg check started: progress bar with $ earned
 * - After 5 deliveries: auto-hides
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, hasSupabaseConfig } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'

const TOTAL = 5
const PER = 800 // cents
const FEE = 4000 // cents
const money = (c) => `$${(c / 100).toFixed(0)}`

export default function EarnBackBar() {
  const { user, profile } = useAuth()
  const [count, setCount] = useState(null)

  const bg = profile?.background_check_status ?? 'not_started'
  const isCourier = profile?.account_type === 'courier'
  const rejected = bg === 'rejected'
  const started = bg !== 'not_started' && !rejected

  useEffect(() => {
    if (!isCourier || !hasSupabaseConfig || !user) return
    let cancelled = false
    supabase
      .from('delivery_requests')
      .select('id', { count: 'exact', head: true })
      .eq('courier_id', user.id)
      .eq('status', 'delivered')
      .then(({ count: c }) => { if (!cancelled) setCount(c ?? 0) })
    return () => { cancelled = true }
  }, [isCourier, user])

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
            <span className="text-slate"> — earn it back over 5 deliveries</span>
          </span>
          <span className="text-[11px] text-teal whitespace-nowrap">Get verified →</span>
        </div>
      </Link>
    )
  }

  // Still loading count
  if (count === null) return null

  const credited = Math.min(count, TOTAL)
  const earned = credited * PER
  const done = credited >= TOTAL

  if (done) return null

  const pct = (credited / TOTAL) * 100

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
