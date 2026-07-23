import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initAnalytics, trackEvent, identifyUser } from './analytics.js'

describe('analytics wrapper', () => {
  let mixpanelMock

  beforeEach(() => {
    mixpanelMock = {
      track: vi.fn(),
      identify: vi.fn(),
      set_config: vi.fn(),
    }
    window.mixpanel = mixpanelMock
  })

  it('should track an event with user_id and timestamp', () => {
    trackEvent('signup_completed', { role: 'sender' })
    expect(mixpanelMock.track).toHaveBeenCalledWith(
      'signup_completed',
      expect.objectContaining({
        role: 'sender',
        timestamp: expect.any(String),
      })
    )
  })

  it('should catch and log tracking errors without throwing', () => {
    mixpanelMock.track.mockImplementation(() => {
      throw new Error('Mixpanel error')
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => trackEvent('test_event')).not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to track event')
    )
    consoleSpy.mockRestore()
  })

  it('should identify a user', () => {
    identifyUser('user-123', { email: 'test@example.com' })
    expect(mixpanelMock.identify).toHaveBeenCalledWith('user-123')
    expect(mixpanelMock.set_config).toHaveBeenCalled()
  })

  it('should handle missing Mixpanel gracefully', () => {
    delete window.mixpanel
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => trackEvent('test_event')).not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Mixpanel not loaded')
    )
    consoleSpy.mockRestore()
  })
})
