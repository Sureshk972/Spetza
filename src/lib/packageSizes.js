// Standard package sizes for Spetza. Free-text was letting "big", "small",
// "med" all coexist in the data — couriers couldn't filter reliably and
// pricing couldn't scale by size. Fixed vocabulary lets us do both later.
//
// Values are stored in delivery_requests.package_size as the short slug
// so old free-text entries still render (we just show the raw string).

export const PACKAGE_SIZES = [
  { value: 'envelope', label: 'Envelope', hint: 'Documents, cards' },
  { value: 'small',    label: 'Small',    hint: 'Fits in a shoebox' },
  { value: 'medium',   label: 'Medium',   hint: 'Fits in a backpack' },
  { value: 'large',    label: 'Large',    hint: 'Two-hand carry' },
]

export function packageSizeLabel(value) {
  if (!value) return null
  const match = PACKAGE_SIZES.find((s) => s.value === value)
  return match ? match.label : value // fall back to raw text for legacy rows
}
