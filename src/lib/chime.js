// Web Audio synthesized two-tone chime. No asset needed, works everywhere,
// silent-fails on browsers where the audio context can't start (e.g. iOS
// requires a prior user gesture on the tab — this returns quietly if so).
//
// Meant for lightweight in-app cues that the app is doing something new
// (courier arrived, new nearby order). Not for OS-level notifications.

let sharedCtx = null

function getCtx() {
  if (sharedCtx) return sharedCtx
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  try {
    sharedCtx = new Ctx()
  } catch {
    return null
  }
  return sharedCtx
}

function tone(ctx, freq, startAt, duration, gainPeak = 0.15) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  osc.connect(gain)
  gain.connect(ctx.destination)
  gain.gain.setValueAtTime(0, startAt)
  gain.gain.linearRampToValueAtTime(gainPeak, startAt + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
  osc.start(startAt)
  osc.stop(startAt + duration + 0.05)
}

export function chime() {
  const ctx = getCtx()
  if (!ctx) return
  // Some browsers suspend the context until first user gesture — try to
  // resume; if it fails, we silently no-op (better than throwing).
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
  const now = ctx.currentTime
  tone(ctx, 880, now, 0.18)          // A5
  tone(ctx, 1174.66, now + 0.16, 0.28) // D6 — pleasant fifth up
}
