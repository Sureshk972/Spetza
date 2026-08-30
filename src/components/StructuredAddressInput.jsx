import { useState, useEffect, useCallback, useRef, useId } from 'react'
import { fetchSuggestions, fetchPlaceDetails, newSessionToken } from '../lib/places.js'
import { withApt } from '../lib/address.js'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
]

const MIN_QUERY_CHARS = 3
const DEBOUNCE_MS = 250

/**
 * The parts a set of coordinates belongs to. Apt is deliberately excluded —
 * a unit number doesn't move the building.
 */
const geoKey = (p) => [p.street, p.city, p.state, p.zip].join('|').toLowerCase()

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
 * The street field doubles as a Google Places combobox. Picking a suggestion
 * fills city/state/zip and hands coordinates straight to onResolved, which
 * saves the caller a separate geocode round trip. Apt is never touched —
 * Google doesn't know unit numbers.
 *
 * Autocomplete is an accelerator, not a gate: every failure closes the dropdown
 * silently and leaves the manual typing + onBlur geocode path working.
 *
 * Props:
 *  - value: full address string (for initial population)
 *  - onChange(fullAddress): called with concatenated address on every change
 *  - onBlur(): called when the last field loses focus (trigger geocode)
 *  - onResolved({ lat, lng, formattedAddress }): called when a suggestion is picked
 *  - disabled: disable all fields
 *  - label: optional label shown above the group
 */
export default function StructuredAddressInput({
  value = '',
  onChange,
  onBlur,
  onResolved,
  disabled = false,
  label,
}) {
  const [parts, setParts] = useState(() => parse(value))
  const [initialized, setInitialized] = useState(false)

  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)

  const sessionRef = useRef(null)
  const abortRef = useRef(null)
  const debounceRef = useRef(null)
  const blurTimerRef = useRef(null)
  // Coordinates from the last picked suggestion, tagged with the parts they
  // describe, so we can tell whether they still apply to what's in the fields.
  const resolvedRef = useRef(null)
  const listboxId = useId()

  // Re-parse if value changes externally (e.g. EditRequest loading data)
  useEffect(() => {
    if (!initialized && value) {
      setParts(parse(value))
      setInitialized(true)
    }
  }, [value, initialized])

  // Drop any pending work if the field unmounts mid-flight.
  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current)
      clearTimeout(blurTimerRef.current)
      abortRef.current?.abort()
    }
  }, [])

  const closeList = useCallback(() => {
    clearTimeout(blurTimerRef.current)
    setOpen(false)
    setHighlight(-1)
  }, [])

  /**
   * Close on blur, but a beat late. mousedown's preventDefault already keeps
   * focus on desktop; touch keyboards are less predictable, and closing the
   * list out from under a finger mid-tap is the difference between a working
   * suggestion and one that silently does nothing.
   */
  const closeListSoon = useCallback(() => {
    clearTimeout(blurTimerRef.current)
    blurTimerRef.current = setTimeout(() => {
      setOpen(false)
      setHighlight(-1)
    }, 150)
  }, [])

  const update = useCallback(
    (field, val) => {
      const next = { ...parts, [field]: val }
      setParts(next)
      onChange?.(concat(next))
      // Callers blank their geo state on every onChange. If this edit didn't
      // touch the parts the coordinates came from — an apt number, typically —
      // re-assert them, or a resolved address quietly becomes unsubmittable.
      const held = resolvedRef.current
      if (held && held.key === geoKey(next)) {
        onResolved?.({
          lat: held.lat,
          lng: held.lng,
          formattedAddress: withApt(held.baseFormatted, next.apt),
        })
      }
    },
    [parts, onChange, onResolved],
  )

  const runQuery = useCallback((input) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    if (!sessionRef.current) sessionRef.current = newSessionToken()

    fetchSuggestions(input, sessionRef.current, { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return
        if (res.error || !res.suggestions?.length) {
          setSuggestions([])
          closeList()
          return
        }
        setSuggestions(res.suggestions)
        setOpen(true)
        setHighlight(-1)
      })
      .catch(() => {
        // Aborted or offline. Autocomplete stays quiet; manual entry still works.
      })
  }, [closeList])

  const handleStreetChange = (val) => {
    update('street', val)
    clearTimeout(debounceRef.current)
    if (val.trim().length < MIN_QUERY_CHARS) {
      abortRef.current?.abort()
      setSuggestions([])
      closeList()
      return
    }
    debounceRef.current = setTimeout(() => runQuery(val.trim()), DEBOUNCE_MS)
  }

  const selectSuggestion = async (s) => {
    clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    closeList()
    setSuggestions([])

    const token = sessionRef.current
    // The session ends the moment details are fetched; the next edit starts a new one.
    sessionRef.current = null

    const details = await fetchPlaceDetails(s.placeId, token)
    if (details.error) {
      // Leave what the sender typed; the onBlur geocode path picks it up.
      return
    }

    // Build the next parts synchronously rather than inside a setState updater:
    // callers reset their geo state on every onChange, so onChange has to land
    // before onResolved or the coordinates we just fetched get wiped.
    const next = {
      ...parts,
      street: details.street || s.mainText,
      city: details.city || parts.city,
      state: details.state || parts.state,
      zip: details.zip || parts.zip,
    }
    setParts(next)
    onChange?.(concat(next))

    if (Number.isFinite(details.lat) && Number.isFinite(details.lng)) {
      resolvedRef.current = {
        key: geoKey(next),
        lat: details.lat,
        lng: details.lng,
        baseFormatted: details.formattedAddress,
      }
      onResolved?.({
        lat: details.lat,
        lng: details.lng,
        formattedAddress: withApt(details.formattedAddress, next.apt),
      })
    }
  }

  const handleKeyDown = (e) => {
    if (!open || !suggestions.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1))
    } else if (e.key === 'Enter') {
      if (highlight >= 0) {
        e.preventDefault()
        selectSuggestion(suggestions[highlight])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeList()
    }
  }

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

      <div className="relative">
        <input
          type="text"
          required
          disabled={disabled}
          value={parts.street}
          onChange={(e) => handleStreetChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={closeListSoon}
          placeholder="Street address"
          className={inputClass}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            highlight >= 0 ? `${listboxId}-opt-${highlight}` : undefined
          }
          autoComplete="off"
        />

        {open && suggestions.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-20 left-0 right-0 mt-1 bg-white border border-mist rounded-lg shadow-lg overflow-hidden"
          >
            {suggestions.map((s, i) => (
              <li
                key={s.placeId}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectSuggestion(s)
                }}
                onMouseEnter={() => setHighlight(i)}
                className={
                  'px-3 py-2.5 cursor-pointer text-sm ' +
                  (i === highlight ? 'bg-mist' : 'bg-white')
                }
              >
                <span className="font-bold text-ink">{s.mainText}</span>
                {s.secondaryText && (
                  <span className="text-slate"> · {s.secondaryText}</span>
                )}
              </li>
            ))}
            <li className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-slate/60 border-t border-mist">
              Powered by Google
            </li>
          </ul>
        )}
      </div>

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
            if (!isComplete) return
            // Places already handed us coordinates for exactly these parts.
            // Re-geocoding costs a call and can only make things worse: if it
            // fails, a perfectly good address flips into an error state.
            const held = resolvedRef.current
            if (held && held.key === geoKey(parts)) return
            onBlur?.(parts.apt)
          }}
          placeholder="Zip"
          maxLength={10}
          className={inputClass}
        />
      </div>
    </div>
  )
}
