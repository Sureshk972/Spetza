export const MAX_DISTANCE_MILES = 50
export const PLATFORM_FEE_BPS = 1500 // 15% — must match the edge function env

export const TIERS = [
  { upTo: 2, cents: 1000 },
  { upTo: 5, cents: 1500 },
  { upTo: 10, cents: 2000 },
  { upTo: 20, cents: 2500 },
  { upTo: 50, cents: 3500 },
]

export function priceForDistance(miles) {
  if (!Number.isFinite(miles) || miles < 0 || miles > MAX_DISTANCE_MILES) return null
  for (const t of TIERS) {
    if (miles <= t.upTo) return t.cents
  }
  return null
}

export function tierLabel(miles) {
  if (!Number.isFinite(miles) || miles <= 0) return ''
  let low = 0
  for (const t of TIERS) {
    if (miles <= t.upTo) return `${low}–${t.upTo} mi`
    low = t.upTo
  }
  return ''
}

export function feeFor(deliveryCents) {
  if (deliveryCents == null) return null
  return Math.round((deliveryCents * PLATFORM_FEE_BPS) / 10000)
}

export function totalFor(deliveryCents) {
  if (deliveryCents == null) return null
  return deliveryCents + feeFor(deliveryCents)
}

// What the courier actually pockets: the delivery price less the 15% fee.
// The sender pays price + 15%, the courier keeps price - 15%; showing the
// bare price to either side misleads both.
export function courierTakeFor(deliveryCents) {
  if (deliveryCents == null) return null
  return deliveryCents - feeFor(deliveryCents)
}

// For a request row: uses the recorded fee once one exists (it shrinks by the
// earn-back credit at delivery), otherwise the standard 15%.
export function courierTakeForRequest(r) {
  const price = r?.accepted_price_cents ?? r?.max_price_cents
  if (price == null) return null
  const fee = r?.platform_fee_cents ?? feeFor(price)
  return price - fee
}

// Everything a page needs to show one amount honestly: the headline the
// person cares about, and the lines that add up to it. `role` picks the
// side: the sender pays price + fee, the courier keeps price − fee.
export function breakoutForRequest(r, role) {
  const price = r?.accepted_price_cents ?? r?.max_price_cents
  if (price == null) return null
  const standardFee = feeFor(price)
  const fee = r?.platform_fee_cents ?? standardFee
  const tip = r?.tip_cents || 0
  const lines = [{ label: 'Delivery rate', cents: price }]
  if (role === 'sender') {
    // The sender is charged the standard fee at accept. The fee on record
    // is the courier side, which the earn-back credit shrinks at delivery,
    // so it must never drive what the sender sees.
    lines.push({ label: 'Platform fee', cents: standardFee })
    if (tip) lines.push({ label: 'Tip', cents: tip })
    return { headline: price + standardFee + tip, lines }
  }
  lines.push({ label: 'Platform fee', cents: -standardFee })
  // The fee on record shrinks by the earn-back credit at delivery; show the
  // credit as its own line so the courier sees why they keep more.
  if (fee < standardFee) lines.push({ label: 'Earn-back credit', cents: standardFee - fee })
  if (tip) lines.push({ label: 'Tip', cents: tip })
  return { headline: price - fee + tip, lines }
}

export function tierOptions() {
  return TIERS.map((t, i) => {
    const low = i === 0 ? 0 : TIERS[i - 1].upTo
    return {
      upTo: t.upTo,
      label: `${low}–${t.upTo} mi`,
      priceLabel: `$${(t.cents / 100).toFixed(2)}`,
    }
  })
}
