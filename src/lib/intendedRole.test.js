import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setIntendedRole, getIntendedRole, clearIntendedRole } from './intendedRole.js'

describe('intendedRole', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.useRealTimers())

  it('returns a role set moments ago', () => {
    setIntendedRole('courier')
    expect(getIntendedRole()).toBe('courier')
  })

  it('ignores anything but sender/courier', () => {
    setIntendedRole('admin')
    expect(getIntendedRole()).toBe(null)
  })

  it('expires after 24 hours', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-28T12:00:00Z'))
    setIntendedRole('courier')
    vi.setSystemTime(new Date('2026-09-29T12:00:01Z'))
    expect(getIntendedRole()).toBe(null)
  })

  it('clears', () => {
    setIntendedRole('courier')
    clearIntendedRole()
    expect(getIntendedRole()).toBe(null)
  })
})
