import TopBar from './TopBar.jsx'
import BottomNav from './BottomNav.jsx'
import Footer from './Footer.jsx'

export default function SenderLayout({ children }) {
  return (
    <div className="fixed inset-0 flex flex-col">
      <TopBar />
      <main className="flex-1 overflow-y-auto">
        <div className="min-h-full flex flex-col">
          <div className="flex-1">{children}</div>
          <Footer />
        </div>
      </main>
      <BottomNav variant="sender" />
    </div>
  )
}
