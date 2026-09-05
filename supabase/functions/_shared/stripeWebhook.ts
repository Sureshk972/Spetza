// Verifying a Stripe webhook signature inside a Supabase edge function.
//
// Two things make this non-obvious, and both of them fail silently as a plain
// 401, which is indistinguishable from an ordinary bad signature.
//
// 1. `constructEvent` cannot work here. On Deno the Stripe library resolves to
//    its web build, whose default crypto provider is SubtleCrypto. SubtleCrypto
//    is async-only, so the synchronous `computeHMACSignature` it needs throws
//    "SubtleCryptoProvider cannot be used in a synchronous context" on every
//    call. `constructEventAsync` with an explicit SubtleCryptoProvider is the
//    only path that verifies anything.
//
// 2. One function may have to answer two destinations. Stripe scopes each
//    webhook destination to either "Your account" or "Connected accounts", and
//    a destination cannot carry both. Connect events fall on both sides of that
//    line -- transfers are platform objects, account.updated belongs to the
//    connected account -- so a function handling both needs two destinations,
//    and Stripe signs each with its own secret. Nothing in the request says
//    which destination sent it, so we try each secret and take the first that
//    verifies.

import Stripe from "https://esm.sh/stripe@14?target=denonext";

const cryptoProvider = Stripe.createSubtleCryptoProvider();

/**
 * Reads the named environment variables and returns those that are set.
 *
 * Order is preserved and matters only for speed: a wrong secret costs one
 * HMAC before we move on, so name the busiest destination first.
 */
export function webhookSecrets(...names: string[]): string[] {
  return names
    .map((name) => Deno.env.get(name))
    .filter((value): value is string => !!value && value.length > 0);
}

/**
 * Returns the verified event, or null if no configured secret matches it.
 *
 * Null covers both "signed by a destination we don't know about" and "not
 * from Stripe at all". Callers answer 401 either way -- a signature we cannot
 * verify is not one we should act on.
 */
export async function verifyStripeEvent(
  stripe: Stripe,
  body: string,
  signature: string,
  secrets: string[],
): Promise<Stripe.Event | null> {
  for (const secret of secrets) {
    try {
      return await stripe.webhooks.constructEventAsync(
        body,
        signature,
        secret,
        undefined,
        cryptoProvider,
      );
    } catch {
      // Wrong secret for this destination, or a forgery. Either way, keep
      // going; the last failure is reported by the caller as a flat 401.
    }
  }
  return null;
}
