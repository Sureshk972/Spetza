import TopBar from './TopBar.jsx'
import BottomNav from './BottomNav.jsx'
import { useUnseenNearbyCount } from '../hooks/useUnseenNearbyCount.js'

export default function CourierLayout({ children }) {
  const unseenCount = useUnseenNearbyCount()

  return (
    <div className="fixed inset-0 flex flex-col">
      <TopBar />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <BottomNav variant="courier" discoverBadge={unseenCount > 0} />
    </div>
  )
}
