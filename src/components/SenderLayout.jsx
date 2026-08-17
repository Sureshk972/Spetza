import TopBar from './TopBar.jsx'
import BottomNav from './BottomNav.jsx'
import { TEST_BAR_HEIGHT } from './TestModeBar.jsx'

export default function SenderLayout({ children }) {
  return (
    <div
      className="fixed left-0 right-0 bottom-0 flex flex-col"
      style={{ top: TEST_BAR_HEIGHT }}
    >
      <TopBar />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <BottomNav variant="sender" />
    </div>
  )
}
