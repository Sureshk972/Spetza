import { describe, it, expect } from 'vitest'
import { courierTakeFor, courierTakeForRequest } from './pricing.js'

describe('courier take', () => {
  it('is the price less the 15% fee', () => {
    expect(courierTakeFor(1500)).toBe(1275)
    expect(courierTakeFor(2000)).toBe(1700)
    expect(courierTakeFor(null)).toBeNull()
  })
  it('uses the recorded fee on a request once one exists', () => {
    expect(courierTakeForRequest({ max_price_cents: 1000, platform_fee_cents: 50 })).toBe(950)
    expect(courierTakeForRequest({ max_price_cents: 1000 })).toBe(850)
    expect(courierTakeForRequest({ accepted_price_cents: 2000, max_price_cents: 2500, platform_fee_cents: 300 })).toBe(1700)
  })
})
