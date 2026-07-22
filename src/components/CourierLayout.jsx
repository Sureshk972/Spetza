import BottomNav from './BottomNav.jsx'

export default function CourierLayout({ children }) {
  return (
    <div className="min-h-full pb-28">
      {children}
      <BottomNav variant="courier" />
    </div>
  )
}
