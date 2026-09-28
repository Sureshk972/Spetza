import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'

let courierPays = true
vi.mock('../../hooks/useAppSetting.js', () => ({ useAppSetting: () => ({ value: courierPays, loaded: true }) }))
vi.mock('../../lib/analytics.js', () => ({ trackEvent: vi.fn() }))
import { trackEvent } from '../../lib/analytics.js'
import { getIntendedRole } from '../../lib/intendedRole.js'
import Drive from '../Drive.jsx'

const renderPage = () => render(<MemoryRouter><Drive /></MemoryRouter>)

describe('Drive', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); courierPays = true; vi.clearAllMocks() })

  it('shows the courier take for every tier', () => {
    renderPage()
    for (const amt of ['$8.50', '$12.75', '$17.00', '$21.25', '$29.75']) {
      expect(screen.getByText(amt)).toBeInTheDocument()
    }
  })

  it('background-check step follows the operator switch', () => {
    renderPage()
    expect(screen.getByText(/earned back at \$1 per delivery/i)).toBeInTheDocument()
    cleanup()
    courierPays = false
    renderPage()
    expect(screen.getByText(/background check on us/i)).toBeInTheDocument()
  })

  it('CTA links to signup, stashes courier, and tracks', () => {
    renderPage()
    expect(trackEvent).toHaveBeenCalledWith('courier_splash_viewed')
    const [hero] = screen.getAllByRole('link', { name: /become a courier/i })
    expect(hero).toHaveAttribute('href', '/signup')
    fireEvent.click(hero)
    expect(getIntendedRole()).toBe('courier')
    expect(trackEvent).toHaveBeenCalledWith('courier_splash_cta', { position: 'hero' })
  })
})
