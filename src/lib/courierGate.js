// Single source of truth for the courier accept gate, mirrored in
// accept-delivery-request. Keep the two in sync.
export function canAcceptDeliveries(p) {
  return (
    !!p?.selfie_path &&
    p?.background_check_status === 'clear' &&
    !!p?.stripe_connect_charges_enabled &&
    !!p?.stripe_connect_payouts_enabled
  )
}

// The next onboarding step a courier still needs, in order.
export function courierStep(p) {
  if (!p?.selfie_path) return 'selfie'
  if (!p?.stripe_connect_payouts_enabled || !p?.stripe_connect_charges_enabled) return 'payouts'
  if (p?.background_check_status !== 'clear') return 'background'
  return 'done'
}
