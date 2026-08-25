// Floating pill shown when a newer build is live. Tapping reloads, which
// pulls the current index.html and its hashed bundle.
//
// A tap target rather than an automatic reload: yanking the page out from
// under a courier mid-delivery -- halfway through a PIN, or with a drop-off
// photo queued -- would lose their work to fix a problem they didn't have.

import { useVersionCheck } from '../hooks/useVersionCheck.js'

export default function UpdateBadge() {
  const updateAvailable = useVersionCheck()
  if (!updateAvailable) return null

  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      aria-label="New version available — tap to refresh"
      className="fixed z-50 right-3 px-3 py-1.5 rounded-full shadow-md border-none cursor-pointer bg-teal text-white text-[11px] font-bold uppercase tracking-wide"
      style={{ top: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
    >
      Update — tap to refresh
    </button>
  )
}
