let mixpanelLoaded = false

export function initAnalytics(token) {
  if (!token) {
    console.warn('Mixpanel token not provided; analytics disabled')
    return
  }

  // Load Mixpanel from CDN
  const script = document.createElement('script')
  script.src = 'https://cdn.mxpnl.com/libs/mixpanel-2/mixpanel.js'
  script.onload = () => {
    if (window.mixpanel) {
      window.mixpanel.init(token, { batch_requests: true })
      mixpanelLoaded = true
    }
  }
  script.onerror = () => {
    console.error('Failed to load Mixpanel SDK')
  }
  document.head.appendChild(script)
}

export function trackEvent(eventName, properties = {}) {
  if (!window.mixpanel) {
    console.warn(`Mixpanel not loaded; event not tracked: ${eventName}`)
    return
  }

  try {
    const eventData = {
      ...properties,
      timestamp: new Date().toISOString(),
    }
    window.mixpanel.track(eventName, eventData)
  } catch (error) {
    console.error(`Failed to track event: ${eventName} - ${error.message}`)
  }
}

export function identifyUser(userId, properties = {}) {
  if (!window.mixpanel) {
    console.warn(`Mixpanel not loaded; user not identified: ${userId}`)
    return
  }

  try {
    window.mixpanel.identify(userId)
    window.mixpanel.set_config(properties)
  } catch (error) {
    console.error(`Failed to identify user: ${userId} - ${error.message}`)
  }
}

export function resetAnalytics() {
  if (window.mixpanel) {
    window.mixpanel.reset()
  }
}
