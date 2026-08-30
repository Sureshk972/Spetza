import { describe, it, expect } from 'vitest'
import { buildLabel } from './build.js'

describe('buildLabel', () => {
  it('renders a real stamp as sha and date', () => {
    // 1788119526482 → 26 Aug 2026
    const out = buildLabel('1788119526482-8eabf3e')
    expect(out).toContain('8eabf3e')
    expect(out).toMatch(/\d{4}/)
    expect(out).toContain('·')
  })

  // Better that support sees "dev" than a blank space where a build should be.
  it('passes through stamps that do not match the build shape', () => {
    expect(buildLabel('dev')).toBe('dev')
    expect(buildLabel('nogit')).toBe('nogit')
    expect(buildLabel('')).toBe('')
  })

  it('keeps a sha containing dashes intact', () => {
    expect(buildLabel('1788119526482-feature-x')).toContain('feature-x')
  })

  it('falls back to the sha when the timestamp is not a real date', () => {
    expect(buildLabel('99999999999999999999-abc1234')).toBe('abc1234')
  })
})
