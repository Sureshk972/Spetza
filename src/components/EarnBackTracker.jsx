/**
 * Earn-back progress tracker for the $40 background check fee.
 * $1 credited per completed delivery, funded from the platform's
 * courier-side fee. 40 deliveries to fully earn back.
 *
 * Two variants:
 *  - 'signup'  → pre-payment messaging + visual promise (CourierVerify)
 *  - 'profile' → compact progress card (CourierProfile)
 *
 * Reads earnback_credited_cents from the profile (authoritative source,
 * set by the apply_earnback_credit DB function on each completion).
 */

const FEE_CENTS = 4000
const PER_CENTS = 100

const money = (cents) => `$${(cents / 100).toFixed(0)}`

export default function EarnBackTracker({ creditedCents = 0, variant = 'profile' }) {
  const earned = Math.min(creditedCents, FEE_CENTS)
  const remaining = FEE_CENTS - earned
  const done = earned >= FEE_CENTS
  const deliveries = Math.floor(earned / PER_CENTS)

  if (variant === 'signup') {
    return <SignupVariant earned={earned} deliveries={deliveries} done={done} />
  }

  return (
    <ProfileVariant
      earned={earned}
      remaining={remaining}
      deliveries={deliveries}
      done={done}
    />
  )
}

/* ── Sign-up / Verify page ────────────────────────────────────── */

function SignupVariant({ earned, deliveries, done }) {
  const pct = (earned / FEE_CENTS) * 100

  return (
    <div className="mt-3 rounded-lg bg-green/5 border border-green/20 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <span className="text-lg">💰</span>
        {done
          ? 'Background check fee earned back!'
          : '$40 fee — earn it back with every delivery'}
      </div>

      {!done && (
        <p className="text-xs text-slate mt-2 leading-relaxed">
          Each completed delivery credits $1 toward your background check fee.
          After 40 deliveries, the full $40 is covered.
        </p>
      )}

      {/* Progress bar */}
      <div className="mt-3">
        <div className="h-2 rounded-full bg-mist overflow-hidden">
          <div
            className="h-full rounded-full bg-green transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px]">
          <span className={earned > 0 ? 'text-green font-medium' : 'text-slate/60'}>
            {earned > 0
              ? `${money(earned)} of ${money(FEE_CENTS)} earned back`
              : `${money(FEE_CENTS)} total`}
          </span>
          <span className="text-slate/60">{deliveries}/40 deliveries</span>
        </div>
      </div>

      {done && (
        <div className="mt-2 text-xs text-green font-medium">
          ✓ All {money(FEE_CENTS)} earned back
        </div>
      )}
    </div>
  )
}

/* ── Profile page ─────────────────────────────────────────────── */

function ProfileVariant({ earned, remaining, deliveries, done }) {
  if (done) {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-green font-medium">
        <span>✓</span>
        <span>{money(FEE_CENTS)} background check fee earned back</span>
      </div>
    )
  }

  const pct = (earned / FEE_CENTS) * 100

  return (
    <div className="mt-3 rounded-lg bg-mist/50 p-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate">Background check earn-back</span>
        <span className="text-ink font-medium tabular-nums">
          {money(earned)} / {money(FEE_CENTS)}
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
        <span>{deliveries} of 40 deliveries</span>
        <span>{money(remaining)} remaining</span>
      </div>
    </div>
  )
}
