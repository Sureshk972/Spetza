import TopBar from './TopBar.jsx'
import BottomNav from './BottomNav.jsx'
import EarnBackBar from './EarnBackBar.jsx'
import { TEST_BAR_HEIGHT } from './TestModeBar.jsx'
import { useUnseenNearbyCount } from '../hooks/useUnseenNearbyCount.js'
import { usePendingPickups } from '../hooks/usePendingPickups.js'

export default function CourierLayout({ children }) {
  const unseenCount = useUnseenNearbyCount()
  const pendingPickups = usePendingPickups()

  return (
    <div
      className="fixed left-0 right-0 bottom-0 flex flex-col"
      style={{ top: TEST_BAR_HEIGHT }}
    >
      <TopBar />
      <EarnBackBar />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <BottomNav variant="courier" discoverBadge={unseenCount > 0} inboxBadge={pendingPickups > 0} />
    </div>
  )
}
