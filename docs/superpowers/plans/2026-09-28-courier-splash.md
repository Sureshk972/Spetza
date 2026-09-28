# Courier Splash Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public page at `/drive` that sells couriers on Spetza and sends them into signup with "Courier" pre-selected on ChooseRole.

**Architecture:** One new page component (`Drive.jsx`) plus a tiny `intendedRole.js` helper (localStorage, 24h expiry — the old stash was removed because it outlived the visit). ChooseRole seeds its `selected` state from the helper but still requires a tap. Earnings come from `pricing.js`, never hard-coded.

**Tech Stack:** React 18, react-router, Tailwind, Vitest + Testing Library (jsdom).

Spec: `docs/superpowers/specs/2026-09-28-courier-splash-design.md`

---

### Task 1: intendedRole helper

**Files:**
- Create: `src/lib/intendedRole.js`
- Test: `src/lib/intendedRole.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setIntendedRole, getIntendedRole, clearIntendedRole } from './intendedRole.js'

describe('intendedRole', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.useRealTimers())

  it('returns a role set moments ago', () => {
    setIntendedRole('courier')
    expect(getIntendedRole()).toBe('courier')
  })

  it('ignores anything but sender/courier', () => {
    setIntendedRole('admin')
    expect(getIntendedRole()).toBe(null)
  })

  it('expires after 24 hours', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-28T12:00:00Z'))
    setIntendedRole('courier')
    vi.setSystemTime(new Date('2026-09-29T12:00:01Z'))
    expect(getIntendedRole()).toBe(null)
  })

  it('clears', () => {
    setIntendedRole('courier')
    clearIntendedRole()
    expect(getIntendedRole()).toBe(null)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/intendedRole.test.js`
Expected: FAIL — cannot resolve `./intendedRole.js`

- [ ] **Step 3: Implement**

```js
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
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/lib/intendedRole.test.js` → 4 passed

- [ ] **Step 5: Commit** — `git add src/lib/intendedRole.* && git commit -m "intendedRole: day-long hint for which role a visitor came for"`

### Task 2: ChooseRole pre-selects from the hint

**Files:**
- Modify: `src/pages/ChooseRole.jsx:1,48` and wherever the role is committed

- [ ] **Step 1:** Change `useState(null)` to `useState(() => getIntendedRole())` and import `{ getIntendedRole, clearIntendedRole }` from `../lib/intendedRole.js`.
- [ ] **Step 2:** In the handler that saves the chosen role, call `clearIntendedRole()` after a successful save.
- [ ] **Step 3:** Update the header comment's last paragraph to: "The hint (`src/lib/intendedRole.js`) only pre-selects and expires in a day. Committing still takes a deliberate tap…"
- [ ] **Step 4:** `npx vitest run` → all green. Commit: `ChooseRole: pre-select from the intended-role hint, still require a tap`

### Task 3: Drive page

**Files:**
- Create: `src/pages/Drive.jsx`
- Test: `src/pages/__tests__/Drive.test.jsx`
- Modify: `src/App.jsx` (import + `<Route path="/drive" element={<Drive />} />` next to `/trust`)

- [ ] **Step 1: Write the failing test**

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
  beforeEach(() => { localStorage.clear(); courierPays = true; vi.clearAllMocks() })

  it('shows the courier take for every tier', () => {
    renderPage()
    for (const amt of ['$8.50', '$12.75', '$17.00', '$21.25', '$29.75']) {
      expect(screen.getByText(amt)).toBeInTheDocument()
    }
  })

  it('background-check step follows the operator switch', () => {
    renderPage()
    expect(screen.getByText(/earned back at \$1 per delivery/i)).toBeInTheDocument()
    courierPays = false
    renderPage()
    expect(screen.getByText(/background check on us/i)).toBeInTheDocument()
  })

  it('CTA links to signup, stashes courier, and tracks', () => {
    renderPage()
    const [hero] = screen.getAllByRole('link', { name: /become a courier/i })
    expect(hero).toHaveAttribute('href', '/signup')
    fireEvent.click(hero)
    expect(getIntendedRole()).toBe('courier')
    expect(trackEvent).toHaveBeenCalledWith('courier_splash_cta', { position: 'hero' })
  })
})
```

- [ ] **Step 2:** `npx vitest run src/pages/__tests__/Drive.test.jsx` → FAIL (no module)

- [ ] **Step 3: Implement `Drive.jsx`** — sections per spec: hero (wordmark SVG copied from Welcome, headline, subhead, CTA), earnings table built from `TIERS.map` with `courierTakeFor(t.cents)` formatted `$X.XX` and range labels (`Under 2 mi`, `2–5 mi`, …), "Plus 100% of tips.", four "Why Spetza" points, three "How to start" steps (step 2 switches on `useAppSetting('courier_pays_background_check', true)`), early-courier perk line, footer CTA + `/trust` and `/faq` links + `<Footer />`. CTA is a `<Link to="/signup" onClick={() => { setIntendedRole('courier'); trackEvent('courier_splash_cta', { position }) }}>`. `useEffect(() => trackEvent('courier_splash_viewed'), [])`. Styling: `max-w-md` single column, `font-display font-extrabold` headings, `text-green` on money, `bg-ink text-white` primary buttons (same classes as Welcome's Get started).

- [ ] **Step 4:** Add the route in `App.jsx`; `npx vitest run` → all green; `npx vite build` → built.

- [ ] **Step 5:** Commit: `Courier splash page at /drive`

### Task 4: Verify and ship

- [ ] Preview at 375px: page renders, no horizontal scroll, CTA → `/signup`.
- [ ] Push to main (Netlify deploys ~75s); share https://spetza.com/drive.
- [ ] Update `docs/marketing/courier-recruiting.md`: replace `spetza.com → "Courier"` with `spetza.com/drive`.
