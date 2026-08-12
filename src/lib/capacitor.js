import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { App } from '@capacitor/app'

export function isNative() {
  return Capacitor.isNativePlatform()
}

export function getPlatform() {
  return Capacitor.getPlatform() // 'ios' | 'android' | 'web'
}

// Call once after first render to dismiss the splash screen.
export async function hideSplash() {
  if (!isNative()) return
  try {
    await SplashScreen.hide({ fadeOutDuration: 300 })
  } catch (e) {
    console.warn('SplashScreen.hide failed:', e)
  }
}

// Style the status bar for light backgrounds (dark text/icons).
export async function configureStatusBar() {
  if (!isNative()) return
  try {
    await StatusBar.setStyle({ style: Style.Light })
    if (getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#FFFFFF' })
    }
  } catch (e) {
    console.warn('StatusBar config failed:', e)
  }
}

// Register a listener for Android hardware back button.
// Returns a cleanup function.
export function onBackButton(callback) {
  if (!isNative()) return () => {}
  const listener = App.addListener('backButton', callback)
  return () => listener.then((l) => l.remove())
}

// Register a deep link listener. Returns a cleanup function.
export function onAppUrlOpen(callback) {
  if (!isNative()) return () => {}
  const listener = App.addListener('appUrlOpen', callback)
  return () => listener.then((l) => l.remove())
}
