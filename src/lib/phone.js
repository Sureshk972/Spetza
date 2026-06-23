// Spetza is US/Canada-focused (per spec). Users naturally type spaces,
// dashes, parens, dots — strip them client-side so the user doesn't
// have to think about E.164. Bare 10-digit input gets +1 prepended;
// 11-digit starting with 1 gets a + added. Anything explicitly
// prefixed with + is honored (just stripped of punctuation), which
// is what lets non-US numbers through if a user really wants one.
export function normalizePhone(raw) {
  const trimmed = (raw || '').trim()
  if (trimmed.startsWith('+')) {
    return `+${trimmed.replace(/\D/g, '')}`
  }
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}
