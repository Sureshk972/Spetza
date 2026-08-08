import { useState, useEffect, useCallback } from 'react'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
]

/** Concatenate structured fields into a single address string. */
function concat(parts) {
  const { street, apt, city, state, zip } = parts
  const line1 = apt ? `${street}, ${apt}` : street
  return [line1, city, `${state} ${zip}`].filter(Boolean).join(', ')
}

/** Best-effort parse of a free-text address into structured parts. */
function parse(address) {
  if (!address) return { street: '', apt: '', city: '', state: '', zip: '' }

  // Try to match: street, city, STATE ZIP
  const m = address.match(
    /^(.+?),\s*(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)(?:,\s*USA)?$/i,
  )
  if (m) {
    let street = m[1].trim()
    let apt = ''
    // Check if street has an apt/unit: "123 Main St, Apt 4"
    const aptMatch = street.match(/^(.+?),\s*((?:Apt|Unit|Suite|Ste|#)\s*.+)$/i)
    if (aptMatch) {
      street = aptMatch[1].trim()
      apt = aptMatch[2].trim()
    }
    return {
      street,
      apt,
      city: m[2].trim(),
      state: m[3].toUpperCase(),
      zip: m[4],
    }
  }

  // Couldn't parse — put everything in street
  return { street: address, apt: '', city: '', state: '', zip: '' }
}

/**
 * Structured address input: Street, Apt, City, State, Zip.
 *
 * Props:
 *  - value: full address string (for initial population)
 *  - onChange(fullAddress): called with concatenated address on every change
 *  - onBlur(): called when the last field loses focus (trigger geocode)
 *  - disabled: disable all fields
 *  - label: optional label shown above the group
 */
export default function StructuredAddressInput({
  value = '',
  onChange,
  onBlur,
  disabled = false,
  label,
}) {
  const [parts, setParts] = useState(() => parse(value))
  const [initialized, setInitialized] = useState(false)

  // Re-parse if value changes externally (e.g. EditRequest loading data)
  useEffect(() => {
    if (!initialized && value) {
      setParts(parse(value))
      setInitialized(true)
    }
  }, [value, initialized])

  const update = useCallback(
    (field, val) => {
      setParts((prev) => {
        const next = { ...prev, [field]: val }
        onChange?.(concat(next))
        return next
      })
    },
    [onChange],
  )

  const isComplete = parts.street && parts.city && parts.state && parts.zip

  const inputClass =
    'w-full px-3 py-2.5 rounded-lg bg-mist border border-mist focus:border-teal focus:outline-none text-sm disabled:opacity-60'

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-xs uppercase tracking-widest text-slate font-bold">
          {label}
        </label>
      )}

      <input
        type="text"
        required
        disabled={disabled}
        value={parts.street}
        onChange={(e) => update('street', e.target.value)}
        placeholder="Street address"
        className={inputClass}
      />

      <input
        type="text"
        disabled={disabled}
        value={parts.apt}
        onChange={(e) => update('apt', e.target.value)}
        placeholder="Apt, suite, unit (optional)"
        className={inputClass}
      />

      <div className="grid grid-cols-[1fr_4.5rem_5.5rem] gap-2">
        <input
          type="text"
          required
          disabled={disabled}
          value={parts.city}
          onChange={(e) => update('city', e.target.value)}
          placeholder="City"
          className={inputClass}
        />

        <select
          required
          disabled={disabled}
          value={parts.state}
          onChange={(e) => update('state', e.target.value)}
          className={`${inputClass} appearance-none px-2 text-center ${
            !parts.state ? 'text-slate/50' : ''
          }`}
        >
          <option value="">State</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <input
          type="text"
          inputMode="numeric"
          required
          disabled={disabled}
          value={parts.zip}
          onChange={(e) =>
            update('zip', e.target.value.replace(/[^\d-]/g, '').slice(0, 10))
          }
          onBlur={() => {
            if (isComplete) onBlur?.()
          }}
          placeholder="Zip"
          maxLength={10}
          className={inputClass}
        />
      </div>
    </div>
  )
}
