/* global __BUILD_ID__ */
// The build stamp Vite bakes into the bundle: `<epoch-ms>-<short sha>`.
// useVersionCheck compares it against /version.json to decide whether to
// offer the update pill; this module is the human-readable half, so a
// courier on a week-old session can read their build out over the phone.

const RAW = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'

export const buildId = RAW

/**
 * Format the stamp for display: "8eabf3e · 26 Aug 2026".
 *
 * Anything that doesn't match the expected shape — the dev server, a build
 * made outside a git checkout — is passed through as-is rather than hidden,
 * since a support conversation is better off seeing "dev" than nothing.
 */
export function buildLabel(raw = RAW) {
  const match = /^(\d+)-(.+)$/.exec(raw)
  if (!match) return raw

  const [, ms, sha] = match
  const date = new Date(Number(ms))
  if (Number.isNaN(date.getTime())) return sha

  return `${sha} · ${date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`
}
