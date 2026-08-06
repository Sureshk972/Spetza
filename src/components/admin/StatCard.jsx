export default function StatCard({ label, value, hint }) {
  return (
    <div className="p-5 rounded-xl border border-mist bg-white">
      <div className="text-xs uppercase tracking-widest text-slate">{label}</div>
      <div className="font-display text-3xl font-black text-ink mt-1">{value}</div>
      {hint && <div className="text-xs text-slate mt-1">{hint}</div>}
    </div>
  )
}
