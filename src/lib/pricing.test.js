import { describe, it, expect } from 'vitest'
import { courierTakeFor, courierTakeForRequest, breakoutForRequest } from './pricing.js'

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

describe('breakoutForRequest', () => {
  it('sender: total on top, delivery + platform fee below', () => {
    expect(breakoutForRequest({ max_price_cents: 2000 }, 'sender')).toEqual({
      headline: 2300,
      lines: [
        { label: 'Delivery rate', cents: 2000 },
        { label: 'Platform fee', cents: 300 },
      ],
    })
  })
  it('sender: always the standard fee (the recorded fee is the courier side) plus a tip line', () => {
    expect(breakoutForRequest({ accepted_price_cents: 2000, max_price_cents: 2000, platform_fee_cents: 200, tip_cents: 500 }, 'sender')).toEqual({
      headline: 2800,
      lines: [
        { label: 'Delivery rate', cents: 2000 },
        { label: 'Platform fee', cents: 300 },
        { label: 'Tip', cents: 500 },
      ],
    })
  })
  it('courier: take on top, delivery and fee below, fee negative', () => {
    expect(breakoutForRequest({ max_price_cents: 2000 }, 'courier')).toEqual({
      headline: 1700,
      lines: [
        { label: 'Delivery rate', cents: 2000 },
        { label: 'Platform fee', cents: -300 },
      ],
    })
  })
  it('courier: shows the earn-back credit when the recorded fee is below 15%', () => {
    expect(breakoutForRequest({ accepted_price_cents: 2000, max_price_cents: 2000, platform_fee_cents: 200, tip_cents: 500 }, 'courier')).toEqual({
      headline: 2300,
      lines: [
        { label: 'Delivery rate', cents: 2000 },
        { label: 'Platform fee', cents: -300 },
        { label: 'Earn-back credit', cents: 100 },
        { label: 'Tip', cents: 500 },
      ],
    })
  })
  it('returns null without a price', () => {
    expect(breakoutForRequest({}, 'sender')).toBeNull()
  })
})
