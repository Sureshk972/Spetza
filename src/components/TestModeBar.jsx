// Persistent visual reminder that the site is running with background
// checks bypassed. Never render in production once Checkr is wired.
// Toggled by VITE_TEST_MODE=true in .env.
//
// Height is 24px. When on, layouts and pages need to sit below it.

const ENABLED = import.meta.env.VITE_TEST_MODE === 'true'

export const TEST_MODE = ENABLED
export const TEST_BAR_HEIGHT = ENABLED ? 24 : 0

export default function TestModeBar() {
  if (!ENABLED) return null
  return (
    <div
      role="status"
      className="fixed top-0 left-0 right-0 z-[100] h-6 bg-amber-500 text-white text-[11px] font-bold uppercase tracking-widest flex items-center justify-center"
      style={{ letterSpacing: '0.1em' }}
    >
      ⚠ Test Mode · Background checks bypassed
    </div>
  )
}
