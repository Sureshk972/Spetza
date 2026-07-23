import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the bundled Mixpanel package. The factory is re-applied after
// vi.resetModules(), so each test gets fresh spies AND a fresh copy of
// analytics.js (its module-level `enabled` flag resets to false).
vi.mock('mixpanel-browser', () => ({
  default: {
    init: vi.fn(),
    track: vi.fn(),
    identify: vi.fn(),
    people: { set: vi.fn() },
    reset: vi.fn(),
  },
}))

describe('analytics wrapper', () => {
  let mixpanel
  let analytics

  beforeEach(async () => {
    vi.resetModules()
    mixpanel = (await import('mixpanel-browser')).default
    analytics = await import('./analytics.js')
    // resetModules resets analytics.js's `enabled` flag, but the mock's
    // spies persist across tests — clear their call history too.
    vi.clearAllMocks()
  })

  it('should track an event with a timestamp after init', () => {
    analytics.initAnalytics('test-token')
    analytics.trackEvent('signup_completed', { role: 'sender' })
    expect(mixpanel.track).toHaveBeenCalledWith(
      'signup_completed',
      expect.objectContaining({
        role: 'sender',
        timestamp: expect.any(String),
      })
    )
  })

  it('should catch and log tracking errors without throwing', () => {
    analytics.initAnalytics('test-token')
    mixpanel.track.mockImplementation(() => {
      throw new Error('Mixpanel error')
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => analytics.trackEvent('test_event')).not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to track event')
    )
    consoleSpy.mockRestore()
  })

  it('should identify a user with people.set (not set_config)', () => {
    analytics.initAnalytics('test-token')
    analytics.identifyUser('user-123', { email: 'test@example.com' })
    expect(mixpanel.identify).toHaveBeenCalledWith('user-123')
    expect(mixpanel.people.set).toHaveBeenCalledWith({ email: 'test@example.com' })
  })

  it('should no-op tracking when not initialized', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => analytics.trackEvent('test_event')).not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('not initialized')
    )
    expect(mixpanel.track).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('should no-op init when token is missing', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    analytics.initAnalytics(undefined)
    expect(mixpanel.init).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('token not provided')
    )
    consoleSpy.mockRestore()
  })
})
