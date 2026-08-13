/**
 * Slim persistent earn-back progress bar — sits below TopBar in CourierLayout.
 * Only renders when the courier has started a background check and hasn't
 * yet earned back the full $40 (5 completed deliveries).
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

  const bg = profile?.background_check_status
  const show = bg && bg !== 'not_started' && bg !== 'rejected'

  useEffect(() => {
    if (!show || !hasSupabaseConfig || !user) return
    let cancelled = false
    supabase
      .from('delivery_requests')
      .select('id', { count: 'exact', head: true })
      .eq('courier_id', user.id)
      .eq('status', 'delivered')
      .then(({ count: c }) => { if (!cancelled) setCount(c ?? 0) })
    return () => { cancelled = true }
  }, [show, user])

  if (!show || count === null) return null

  const credited = Math.min(count, TOTAL)
  const earned = credited * PER
  const done = credited >= TOTAL

  if (done) return null // fully earned back — no need to show

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
