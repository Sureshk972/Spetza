export const MAX_DISTANCE_MILES = 20
export const PLATFORM_FEE_BPS = 1500 // 15% — must match the edge function env

export const TIERS = [
  { upTo: 2, cents: 1000 },
  { upTo: 5, cents: 1500 },
  { upTo: 10, cents: 2000 },
  { upTo: 20, cents: 2500 },
]

export function priceForDistance(miles) {
  if (!Number.isFinite(miles) || miles <= 0 || miles > MAX_DISTANCE_MILES) return null
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
