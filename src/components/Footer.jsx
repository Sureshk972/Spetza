import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="py-8 text-center text-[11px] text-slate/60 space-y-2">
      <div className="flex justify-center gap-3">
        <Link to="/privacy" className="hover:text-ink transition-colors">Privacy Policy</Link>
        <span>·</span>
        <Link to="/terms" className="hover:text-ink transition-colors">Terms of Service</Link>
        <span>·</span>
        <Link to="/trust" className="hover:text-ink transition-colors">Trust &amp; Safety</Link>
        <span>·</span>
        <Link to="/faq" className="hover:text-ink transition-colors">FAQ</Link>
      </div>
      <div>© 2026 12 Sigma LLC · Spetza is a DBA of 12 Sigma LLC</div>
    </footer>
  )
}
