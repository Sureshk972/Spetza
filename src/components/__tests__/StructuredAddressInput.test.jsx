import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('../../lib/places.js', () => ({
  newSessionToken: () => 'test-session',
  fetchSuggestions: vi.fn(),
  fetchPlaceDetails: vi.fn(),
}))

import { fetchSuggestions, fetchPlaceDetails } from '../../lib/places.js'
import StructuredAddressInput from '../StructuredAddressInput.jsx'

const SUGGESTION = {
  placeId: 'place-1',
  mainText: '1234 W Foster Ave',
  secondaryText: 'Chicago, IL, USA',
}

const DETAILS = {
  street: '1234 W Foster Ave',
  city: 'Chicago',
  state: 'IL',
  zip: '60640',
  lat: 41.9758,
  lng: -87.6653,
  formattedAddress: '1234 W Foster Ave, Chicago, IL 60640, USA',
}

/** Type into the street field and let the 250ms debounce elapse for real. */
async function typeStreet(text) {
  fireEvent.change(screen.getByPlaceholderText('Street address'), {
    target: { value: text },
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 350))
  })
}

/** The state field is a <select>, so it has no placeholder to query by. */
const stateSelect = () => document.querySelector('select')

/**
 * Type, then click the first suggestion. Scoped to the listbox because the
 * US-states <select> also contributes elements with the "option" role.
 */
async function pickSuggestion() {
  await typeStreet('1234 W Foster')
  const list = await screen.findByRole('listbox')
  const option = within(list).getByRole('option')
  await act(async () => {
    fireEvent.mouseDown(option)
  })
}

beforeEach(() => {
  fetchSuggestions.mockResolvedValue({ suggestions: [SUGGESTION] })
  fetchPlaceDetails.mockResolvedValue(DETAILS)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('StructuredAddressInput autocomplete', () => {
  it('fills city, state and zip from a picked suggestion and reports coordinates', async () => {
    const onResolved = vi.fn()
    render(<StructuredAddressInput onChange={() => {}} onResolved={onResolved} />)

    await pickSuggestion()

    expect(screen.getByPlaceholderText('City')).toHaveValue('Chicago')
    expect(screen.getByPlaceholderText('Zip')).toHaveValue('60640')
    expect(onResolved).toHaveBeenCalledWith({
      lat: DETAILS.lat,
      lng: DETAILS.lng,
      formattedAddress: DETAILS.formattedAddress,
    })
  })

  it('leaves the apt field alone — Google does not know unit numbers', async () => {
    render(<StructuredAddressInput onChange={() => {}} onResolved={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText('Apt, suite, unit (optional)'), {
      target: { value: 'Apt 3R' },
    })
    await pickSuggestion()

    expect(screen.getByPlaceholderText('Apt, suite, unit (optional)')).toHaveValue('Apt 3R')
  })

  // The natural order is now: pick a suggestion (which fills city/state/zip),
  // THEN type the apartment number. Callers blank their geo state on every
  // onChange, so an apt edit must re-assert the coordinates or the sender is
  // left with a complete-looking address that cannot be submitted.
  it('keeps coordinates alive when the apt is typed after picking a suggestion', async () => {
    const onResolved = vi.fn()
    render(<StructuredAddressInput onChange={() => {}} onResolved={onResolved} />)

    await pickSuggestion()
    onResolved.mockClear()

    fireEvent.change(screen.getByPlaceholderText('Apt, suite, unit (optional)'), {
      target: { value: 'Apt 3R' },
    })

    expect(onResolved.mock.calls.at(-1)[0]).toMatchObject({
      lat: DETAILS.lat,
      lng: DETAILS.lng,
    })
  })

  // The courier reads pickupGeo.formatted off a doorstep. Google's formatted
  // address describes the building and has never heard of "Apt 3R", so losing
  // the unit number strands a courier in a lobby.
  it('keeps a previously typed apt in the address it reports', async () => {
    const onResolved = vi.fn()
    render(<StructuredAddressInput onChange={() => {}} onResolved={onResolved} />)

    fireEvent.change(screen.getByPlaceholderText('Apt, suite, unit (optional)'), {
      target: { value: 'Apt 3R' },
    })
    await pickSuggestion()

    expect(onResolved.mock.calls.at(-1)[0].formattedAddress).toContain('Apt 3R')
  })

  it('keeps an apt typed after the pick in the address it reports', async () => {
    const onResolved = vi.fn()
    render(<StructuredAddressInput onChange={() => {}} onResolved={onResolved} />)

    await pickSuggestion()
    fireEvent.change(screen.getByPlaceholderText('Apt, suite, unit (optional)'), {
      target: { value: 'Apt 3R' },
    })

    expect(onResolved.mock.calls.at(-1)[0].formattedAddress).toContain('Apt 3R')
  })

  it('does not duplicate a unit the formatted address already carries', async () => {
    fetchPlaceDetails.mockResolvedValue({
      ...DETAILS,
      formattedAddress: '1234 W Foster Ave #3R, Chicago, IL 60640, USA',
    })
    const onResolved = vi.fn()
    render(<StructuredAddressInput onChange={() => {}} onResolved={onResolved} />)

    fireEvent.change(screen.getByPlaceholderText('Apt, suite, unit (optional)'), {
      target: { value: '#3R' },
    })
    await pickSuggestion()

    const reported = onResolved.mock.calls.at(-1)[0].formattedAddress
    expect(reported.match(/3R/g)).toHaveLength(1)
  })

  // Places already gave us coordinates. Re-geocoding costs a call and can only
  // make things worse: if it fails, a good address flips into an error state.
  it('does not re-geocode on zip blur when a suggestion already resolved', async () => {
    const onBlur = vi.fn()
    render(<StructuredAddressInput onChange={() => {}} onResolved={() => {}} onBlur={onBlur} />)

    await pickSuggestion()
    fireEvent.blur(screen.getByPlaceholderText('Zip'))

    expect(onBlur).not.toHaveBeenCalled()
  })

  it('still geocodes on zip blur when the address was typed by hand', async () => {
    const onBlur = vi.fn()
    render(<StructuredAddressInput onChange={() => {}} onBlur={onBlur} />)

    fireEvent.change(screen.getByPlaceholderText('Street address'), {
      target: { value: '99 Nowhere Rd' },
    })
    fireEvent.change(screen.getByPlaceholderText('City'), { target: { value: 'Chicago' } })
    fireEvent.change(stateSelect(), { target: { value: 'IL' } })
    fireEvent.change(screen.getByPlaceholderText('Zip'), { target: { value: '60640' } })
    fireEvent.blur(screen.getByPlaceholderText('Zip'))

    expect(onBlur).toHaveBeenCalled()
  })

  it('re-geocodes on zip blur once the street is edited away from the resolved one', async () => {
    const onBlur = vi.fn()
    render(<StructuredAddressInput onChange={() => {}} onResolved={() => {}} onBlur={onBlur} />)

    await pickSuggestion()
    await typeStreet('1234 W Foster Ave Rear')
    fireEvent.blur(screen.getByPlaceholderText('Zip'))

    expect(onBlur).toHaveBeenCalled()
  })

  it('stays silent and submittable when suggestions fail', async () => {
    fetchSuggestions.mockResolvedValue({ error: 'places http 403: API not enabled' })
    render(<StructuredAddressInput onChange={() => {}} />)

    await typeStreet('1234 W Foster')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Street address')).toHaveValue('1234 W Foster')
  })

  it('falls back to the geocode path when place details fail', async () => {
    fetchPlaceDetails.mockResolvedValue({ error: 'places details http 500' })
    const onResolved = vi.fn()
    const onBlur = vi.fn()
    render(
      <StructuredAddressInput onChange={() => {}} onResolved={onResolved} onBlur={onBlur} />,
    )

    await pickSuggestion()
    fireEvent.change(screen.getByPlaceholderText('City'), { target: { value: 'Chicago' } })
    fireEvent.change(stateSelect(), { target: { value: 'IL' } })
    fireEvent.change(screen.getByPlaceholderText('Zip'), { target: { value: '60640' } })
    fireEvent.blur(screen.getByPlaceholderText('Zip'))

    expect(onResolved).not.toHaveBeenCalled()
    expect(onBlur).toHaveBeenCalled()
  })

  it('does not query until the input is long enough to be an address', async () => {
    render(<StructuredAddressInput onChange={() => {}} />)

    await typeStreet('12')

    expect(fetchSuggestions).not.toHaveBeenCalled()
  })
})
