import { describe, expect, it } from 'vitest'
import { REQUEST_KINDS, pickupContactError, contactStatusCopy } from './requestKind.js'

describe('REQUEST_KINDS', () => {
  it('offers send and pickup with the agreed labels', () => {
    expect(REQUEST_KINDS).toEqual([
      { value: 'send', label: 'Deliver' },
      { value: 'pickup', label: 'Pick Up' },
    ])
  })
})

describe('pickupContactError', () => {
  it('returns null for a name and a US mobile', () => {
    expect(pickupContactError({ name: 'Joe', phone: '(312) 555-0100' })).toBeNull()
  })
  it('requires a name', () => {
    expect(pickupContactError({ name: '  ', phone: '3125550100' })).toBe('Who is handing it over?')
  })
  it('requires a 10-digit US number', () => {
    expect(pickupContactError({ name: 'Joe', phone: '555' })).toBe('Enter a 10-digit US mobile number.')
    expect(pickupContactError({ name: 'Joe', phone: '+447911123456' })).toBe('Enter a 10-digit US mobile number.')
  })
  it('caps the name at 80 characters', () => {
    expect(pickupContactError({ name: 'x'.repeat(81), phone: '3125550100' })).toBe('Name is too long.')
  })
})

describe('contactStatusCopy', () => {
  it('says the text went out', () => {
    expect(contactStatusCopy('Joe', 'sent')).toBe("We texted Joe the pickup PIN and your courier's name.")
  })
  it('says it is still sending', () => {
    expect(contactStatusCopy('Joe', 'pending')).toBe('Texting Joe…')
  })
  it('asks the requester to relay when the text failed', () => {
    expect(contactStatusCopy('Joe', 'failed')).toBe("The text to Joe didn't go through. Give Joe this PIN yourself.")
  })
})
