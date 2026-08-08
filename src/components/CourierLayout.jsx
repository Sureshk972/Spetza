import TopBar from './TopBar.jsx'
import BottomNav from './BottomNav.jsx'

export default function CourierLayout({ children }) {
  return (
    <div className="fixed inset-0 flex flex-col">
      <TopBar />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <BottomNav variant="courier" />
    </div>
  )
}
