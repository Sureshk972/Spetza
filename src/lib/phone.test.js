import { describe, expect, it } from 'vitest'
import { normalizePhone } from './phone.js'

describe('normalizePhone', () => {
  it('adds +1 to a bare 10-digit US number', () => {
    expect(normalizePhone('5551234567')).toBe('+15551234567')
  })

  it('formats human-typed punctuation', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('+15551234567')
    expect(normalizePhone('555.123.4567')).toBe('+15551234567')
  })

  it('adds + to an 11-digit number starting with 1', () => {
    expect(normalizePhone('15551234567')).toBe('+15551234567')
  })

  it('leaves an already-prefixed number alone (sans punctuation)', () => {
    expect(normalizePhone('+1 555 123 4567')).toBe('+15551234567')
    expect(normalizePhone('+447911123456')).toBe('+447911123456')
  })

  it('returns empty for empty / nullish input', () => {
    expect(normalizePhone('')).toBe('+')
    expect(normalizePhone(null)).toBe('+')
    expect(normalizePhone(undefined)).toBe('+')
  })
})
