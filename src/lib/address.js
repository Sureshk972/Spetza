/**
 * Google's formatted address describes the building, so the unit the sender
 * typed is missing from it. Put it back before anyone downstream stores it —
 * the courier reads this string on a doorstep.
 */
export function withApt(formatted, apt) {
  const unitText = (apt || '').trim()
  if (!unitText) return formatted || ''
  if (!formatted) return unitText

  // Skip if the formatted address already names this unit, so "#3R" doesn't
  // become "#3R, #3R". Matched against a unit marker rather than bare digits,
  // which would collide with the street number.
  const bare = unitText.replace(/^(apt\.?|unit|suite|ste\.?|#)\s*/i, '').trim()
  if (bare) {
    const escaped = bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`(#|apt\\.?|unit|suite|ste\\.?)\\s*${escaped}\\b`, 'i').test(formatted)) {
      return formatted
    }
  }

  const comma = formatted.indexOf(',')
  if (comma === -1) return `${formatted}, ${unitText}`
  return `${formatted.slice(0, comma)}, ${unitText}${formatted.slice(comma)}`
}
