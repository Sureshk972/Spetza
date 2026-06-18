import { Link } from 'react-router-dom'

export default function Welcome() {
  return (
    <div className="min-h-full flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="inline-block px-3 py-1 rounded-full bg-mist text-slate text-xs uppercase tracking-widest">
          Peer-to-peer delivery
        </div>
        <h1 className="font-serif text-6xl text-ink mt-6 tracking-tight">Spetza</h1>
        <p className="text-slate mt-4 text-lg">Get it there.</p>
        <p className="text-slate mt-6 leading-relaxed">
          Post a package. A nearby courier picks it up and delivers it.
          No schedules. No depots. Just neighbors moving things for neighbors.
        </p>
        <Link
          to="/signin"
          className="inline-block mt-10 px-6 py-3 rounded-lg bg-ink text-cream font-medium hover:bg-signal transition-colors"
        >
          Get started
        </Link>
      </div>
    </div>
  )
}
