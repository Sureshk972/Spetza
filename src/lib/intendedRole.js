// A hint, not a decision: which role a visitor was reading about when they
// tapped through to signup. ChooseRole uses it to pre-select and still waits
// for a tap. Expires in a day so browsing in June can't steer a July signup.
const KEY = 'spetza:intended_role'
const TTL_MS = 24 * 60 * 60 * 1000
const ROLES = ['sender', 'courier']

export function setIntendedRole(role) {
  if (!ROLES.includes(role)) return
  try { localStorage.setItem(KEY, JSON.stringify({ role, at: Date.now() })) } catch { /* private mode */ }
}

export function getIntendedRole() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!raw || !ROLES.includes(raw.role) || Date.now() - raw.at > TTL_MS) return null
    return raw.role
  } catch { return null }
}

export function clearIntendedRole() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
