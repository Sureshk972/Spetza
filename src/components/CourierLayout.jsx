import TopBar from './TopBar.jsx'
import BottomNav from './BottomNav.jsx'
import EarnBackBar from './EarnBackBar.jsx'
import Footer from './Footer.jsx'
import { useUnseenNearbyCount } from '../hooks/useUnseenNearbyCount.js'
import { usePendingPickups } from '../hooks/usePendingPickups.js'

export default function CourierLayout({ children }) {
  const unseenCount = useUnseenNearbyCount()
  const pendingPickups = usePendingPickups()

  return (
    <div className="fixed inset-0 flex flex-col">
      <TopBar />
      <EarnBackBar />
      <main className="flex-1 overflow-y-auto">
        <div className="min-h-full flex flex-col">
          <div className="flex-1">{children}</div>
          <Footer />
        </div>
      </main>
      <BottomNav variant="courier" discoverBadge={unseenCount > 0} inboxBadge={pendingPickups > 0} />
    </div>
  )
}
