import TopBar from './TopBar.jsx'
import BottomNav from './BottomNav.jsx'

export default function SenderLayout({ children }) {
  return (
    <div className="min-h-full pb-28">
      <TopBar />
      {children}
      <BottomNav variant="sender" />
    </div>
  )
}
