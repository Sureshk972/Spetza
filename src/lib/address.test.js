import { describe, it, expect } from 'vitest'
import { withApt } from './address.js'

const BASE = '1234 W Foster Ave, Chicago, IL 60640, USA'

describe('withApt', () => {
  it('returns the address untouched when there is no unit', () => {
    expect(withApt(BASE, '')).toBe(BASE)
    expect(withApt(BASE, '   ')).toBe(BASE)
    expect(withApt(BASE, null)).toBe(BASE)
  })

  it('inserts the unit right after the street line', () => {
    expect(withApt(BASE, 'Apt 3R')).toBe('1234 W Foster Ave, Apt 3R, Chicago, IL 60640, USA')
  })

  it('does not repeat a unit the address already names', () => {
    const withUnit = '1234 W Foster Ave #3R, Chicago, IL 60640, USA'
    expect(withApt(withUnit, '#3R')).toBe(withUnit)
    expect(withApt(withUnit, 'Apt 3R')).toBe(withUnit)
    expect(withApt('1234 W Foster Ave Unit 3R, Chicago, IL', 'Ste 3R')).toBe(
      '1234 W Foster Ave Unit 3R, Chicago, IL',
    )
  })

  // "Apt 3" must not be swallowed by the 3 in the street number.
  it('does not mistake a street number for the unit', () => {
    expect(withApt('3 Elm St, Chicago, IL 60640, USA', 'Apt 3')).toBe(
      '3 Elm St, Apt 3, Chicago, IL 60640, USA',
    )
  })

  it('handles an address with no comma at all', () => {
    expect(withApt('1234 W Foster Ave', 'Apt 3R')).toBe('1234 W Foster Ave, Apt 3R')
  })

  it('falls back to the unit when there is no address', () => {
    expect(withApt('', 'Apt 3R')).toBe('Apt 3R')
    expect(withApt(undefined, 'Apt 3R')).toBe('Apt 3R')
  })

  it('does not blow up on regex metacharacters in the unit', () => {
    expect(() => withApt(BASE, 'Apt (rear)')).not.toThrow()
    expect(withApt(BASE, 'Apt (rear)')).toContain('Apt (rear)')
  })
})
