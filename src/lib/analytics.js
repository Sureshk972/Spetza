import mixpanel from 'mixpanel-browser'

// Whether initAnalytics ran with a valid token. When false, all
// tracking calls no-op with a warning so the app never depends on
// analytics being available (missing token in dev/test, etc.).
let enabled = false

export function initAnalytics(token) {
  if (!token) {
    console.warn('Mixpanel token not provided; analytics disabled')
    return
  }
  mixpanel.init(token, { batch_requests: true })
  enabled = true
}

export function trackEvent(eventName, properties = {}) {
  if (!enabled) {
    console.warn(`Mixpanel not initialized; event not tracked: ${eventName}`)
    return
  }

  try {
    mixpanel.track(eventName, {
      ...properties,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error(`Failed to track event: ${eventName} - ${error.message}`)
  }
}

export function identifyUser(userId, properties = {}) {
  if (!enabled) {
    console.warn(`Mixpanel not initialized; user not identified: ${userId}`)
    return
  }

  try {
    mixpanel.identify(userId)
    // people.set writes user PROFILE properties (email, role, zip).
    // Do NOT use set_config here — that sets library config, not the
    // profile, and user attributes would silently never be recorded.
    mixpanel.people.set(properties)
  } catch (error) {
    console.error(`Failed to identify user: ${userId} - ${error.message}`)
  }
}

export function resetAnalytics() {
  if (enabled) mixpanel.reset()
}
