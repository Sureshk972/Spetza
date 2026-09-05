// Per-user request budgets for edge functions that spend money per call.
//
// Auth answers "is this a real user", not "how much may they spend".
// places-autocomplete bills Google on every keystroke, so a signed-in account
// holding a key down is a real cost with no ceiling on it.
//
// Two budgets per action, deliberately. A per-minute cap stops a key held
// down; on its own it still permits ~86,000 requests a day at a steady drip,
// which is the shape an actual abuser would use. The daily cap is the one
// that bounds the bill.
//
// See migration 20260905000001_api_rate_limits.sql for the fixed-window
// semantics and why the counter is safe to keep in a single row.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface Budget {
  /** Row key. Namespaced per function and action, e.g. "places:suggest:min". */
  bucket: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** The budget that rejected the call, for the log line. */
  exceeded?: Budget;
}

/**
 * Counts one request against every budget and reports whether it may proceed.
 *
 * Fails **open**. This guards a spend ceiling on a path the sender needs to
 * type an address; if the limiter itself is broken -- migration not applied,
 * database unreachable -- refusing every address entry would be a far worse
 * outcome than the overspend it exists to prevent. Failures are logged loudly
 * so a limiter that has quietly stopped limiting is visible.
 *
 * Every budget is evaluated even after one rejects, so a caller who keeps
 * hammering is counted against the daily budget too rather than parking
 * harmlessly on the minute one.
 */
export async function consumeRateLimits(
  supabase: SupabaseClient,
  userId: string,
  budgets: Budget[],
): Promise<RateLimitResult> {
  let exceeded: Budget | undefined;

  for (const budget of budgets) {
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_user_id: userId,
      p_bucket: budget.bucket,
      p_limit: budget.limit,
      p_window_seconds: budget.windowSeconds,
    });

    if (error) {
      console.error(
        `rateLimit: budget "${budget.bucket}" could not be checked, allowing the ` +
          `request through:`,
        error.message,
      );
      continue;
    }

    if (data === false && !exceeded) exceeded = budget;
  }

  return exceeded ? { allowed: false, exceeded } : { allowed: true };
}
