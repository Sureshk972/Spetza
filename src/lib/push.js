import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase.js'
import { getPlatform } from './capacitor.js'

// Initialize push notifications after the user logs in.
// Requests permission, registers with FCM, and upserts the token.
export async function initPush(userId) {
  if (!Capacitor.isNativePlatform()) return

  const permResult = await PushNotifications.requestPermissions()
  if (permResult.receive !== 'granted') {
    console.warn('Push permission not granted')
    return
  }

  // Listen for registration success
  PushNotifications.addListener('registration', async ({ value: token }) => {
    console.log('Push token received:', token.slice(0, 20) + '…')
    await upsertToken(userId, token)
  })

  // Listen for registration errors
  PushNotifications.addListener('registrationError', (err) => {
    console.error('Push registration failed:', err)
  })

  // Listen for incoming push while app is in foreground
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('Push received in foreground:', notification.title)
    // Could show an in-app toast here in the future
  })

  // Listen for push notification tap (app was backgrounded or killed)
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = action.notification?.data
    if (data?.deep_link) {
      // Navigate using window.location — React Router will handle it
      window.location.href = data.deep_link
    }
  })

  // Register with FCM
  await PushNotifications.register()
}

// Remove push token and listeners when user logs out.
export async function teardownPush(userId) {
  if (!Capacitor.isNativePlatform()) return

  try {
    // Delete all tokens for this user on this device
    await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)

    await PushNotifications.removeAllListeners()
  } catch (e) {
    console.warn('Push teardown error:', e)
  }
}

async function upsertToken(userId, token) {
  const platform = getPlatform() // 'ios' | 'android'

  // Upsert: if the token already exists (same device re-registering),
  // update the user_id and timestamp. If it's new, insert.
  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { user_id: userId, token, platform, updated_at: new Date().toISOString() },
      { onConflict: 'token' }
    )

  if (error) {
    console.error('Failed to save push token:', error)
  }
}
