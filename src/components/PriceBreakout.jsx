// Headline amount with the lines that make it up underneath. Used on every
// card and page that shows money, so both sides always see the same story.
const dollars = (cents) => `${cents < 0 ? '−' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`

export default function PriceBreakout({ breakout, caption, size = 'md', className = '' }) {
  if (!breakout) return null
  const headlineClass = size === 'lg' ? 'text-2xl' : 'text-xl'
  return (
    <div className={className}>
      <div className={`font-display ${headlineClass} text-ink`}>
        {dollars(breakout.headline)}
        {caption && <span className="ml-2 text-xs font-sans text-slate/70">{caption}</span>}
      </div>
      <div className="mt-1 space-y-0.5">
        {breakout.lines.map((l) => (
          <div key={l.label} className="flex items-baseline gap-2 text-xs text-slate">
            <span className="text-ink tabular-nums w-16">{dollars(l.cents)}</span>
            <span>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
