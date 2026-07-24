import { describe, it, expect } from 'vitest'
import { canAcceptDeliveries, courierStep } from '../../../lib/courierGate.js'

const base = {
  selfie_path: 'u/selfie.jpg',
  background_check_status: 'clear',
  stripe_connect_charges_enabled: true,
  stripe_connect_payouts_enabled: true,
}

describe('canAcceptDeliveries', () => {
  it('allows only when all three pass', () => {
    expect(canAcceptDeliveries(base)).toBe(true)
  })
  it('blocks without a selfie', () => {
    expect(canAcceptDeliveries({ ...base, selfie_path: null })).toBe(false)
  })
  it('blocks when background not clear', () => {
    expect(canAcceptDeliveries({ ...base, background_check_status: 'pending' })).toBe(false)
    expect(canAcceptDeliveries({ ...base, background_check_status: 'consider' })).toBe(false)
  })
  it('blocks without payouts', () => {
    expect(canAcceptDeliveries({ ...base, stripe_connect_payouts_enabled: false })).toBe(false)
  })
})

describe('courierStep', () => {
  it('returns the next incomplete step', () => {
    expect(courierStep({ ...base, selfie_path: null })).toBe('selfie')
    expect(courierStep({ ...base, stripe_connect_payouts_enabled: false })).toBe('payouts')
    expect(courierStep({ ...base, background_check_status: 'not_started' })).toBe('background')
    expect(courierStep(base)).toBe('done')
  })
})
