import BottomNav from './BottomNav.jsx'

export default function SenderLayout({ children }) {
  return (
    <div className="min-h-full pb-28">
      {children}
      <BottomNav variant="sender" />
    </div>
  )
}
