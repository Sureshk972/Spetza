/**
 * Earn-back progress tracker for the $40 background check fee.
 * $8 credited per delivery over the courier's first 5 deliveries,
 * funded from the platform's share of the delivery fee.
 *
 * Two variants:
 *  - 'signup'  → pre-payment messaging + visual promise (CourierVerify)
 *  - 'profile' → compact progress card (CourierProfile)
 */

const TOTAL_FEE_CENTS = 4000
const PER_DELIVERY_CENTS = 800
const REQUIRED_DELIVERIES = 5

const money = (cents) => `$${(cents / 100).toFixed(0)}`

export default function EarnBackTracker({ completedCount = 0, variant = 'profile' }) {
  const credited = Math.min(completedCount, REQUIRED_DELIVERIES)
  const earnedBackCents = credited * PER_DELIVERY_CENTS
  const remainingCents = TOTAL_FEE_CENTS - earnedBackCents
  const done = credited >= REQUIRED_DELIVERIES

  if (variant === 'signup') {
    return <SignupVariant credited={credited} done={done} />
  }

  return (
    <ProfileVariant
      credited={credited}
      earnedBackCents={earnedBackCents}
      remainingCents={remainingCents}
      done={done}
    />
  )
}

/* ── Sign-up / Verify page ────────────────────────────────────── */

function SignupVariant({ credited, done }) {
  return (
    <div className="mt-3 rounded-lg bg-green/5 border border-green/20 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <span className="text-lg">💰</span>
        {done
          ? 'Background check fee earned back!'
          : '$40 fee — earn it back delivering'}
      </div>

      {!done && (
        <p className="text-xs text-slate mt-2 leading-relaxed">
          Your first 5 deliveries each credit $8 back from the platform fee.
          After 5 deliveries the full $40 is paid back.
        </p>
      )}

      {/* Segmented progress — 5 blocks */}
      <div className="mt-3 flex gap-1.5">
        {Array.from({ length: REQUIRED_DELIVERIES }, (_, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div
              className={`w-full h-2 rounded-full transition-colors ${
                i < credited ? 'bg-green' : 'bg-mist'
              }`}
            />
            <span className={`text-[10px] tabular-nums ${
              i < credited ? 'text-green font-medium' : 'text-slate/60'
            }`}>
              $8
            </span>
          </div>
        ))}
      </div>

      {credited > 0 && !done && (
        <div className="mt-2 text-xs text-green font-medium">
          {money(credited * PER_DELIVERY_CENTS)} of {money(TOTAL_FEE_CENTS)} earned back · {credited} of {REQUIRED_DELIVERIES} deliveries
        </div>
      )}
      {done && (
        <div className="mt-2 text-xs text-green font-medium">
          ✓ All {money(TOTAL_FEE_CENTS)} earned back
        </div>
      )}
    </div>
  )
}

/* ── Profile page ─────────────────────────────────────────────── */

function ProfileVariant({ credited, earnedBackCents, remainingCents, done }) {
  if (done) {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-green font-medium">
        <span>✓</span>
        <span>{money(TOTAL_FEE_CENTS)} background check fee earned back</span>
      </div>
    )
  }

  const pct = (credited / REQUIRED_DELIVERIES) * 100

  return (
    <div className="mt-3 rounded-lg bg-mist/50 p-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate">Background check earn-back</span>
        <span className="text-ink font-medium tabular-nums">
          {money(earnedBackCents)} / {money(TOTAL_FEE_CENTS)}
        </span>
      </div>

      {/* Continuous progress bar */}
      <div className="h-2 rounded-full bg-mist overflow-hidden">
        <div
          className="h-full rounded-full bg-green transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate">
        <span>{credited} of {REQUIRED_DELIVERIES} deliveries</span>
        <span>{money(remainingCents)} remaining</span>
      </div>
    </div>
  )
}
