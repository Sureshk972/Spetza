export default function RatingBadge({ avg, count }) {
  if (!count) {
    return (
      <span className="text-xs text-slate/60">No ratings yet</span>
    )
  }
  const avgNum = Number(avg)
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate">
      <span className="text-signal">★</span>
      <span className="text-ink font-medium">{avgNum.toFixed(1)}</span>
      <span className="text-slate/60">({count})</span>
    </span>
  )
}
