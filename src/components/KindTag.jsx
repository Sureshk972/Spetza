// One colour per direction: green for Deliver, teal for Pick Up. The order
// code and the tag share it so a card reads at a glance.
export const kindTextClass = (kind) => (kind === 'pickup' ? 'text-teal' : 'text-green')

// Which way a delivery runs, at a glance. Same words as the switch on the
// New Order form so a card reads back what the requester chose.
export default function KindTag({ kind, className = '' }) {
  const pickup = kind === 'pickup'
  return (
    <span
      className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${
        pickup ? 'bg-teal/10 text-teal' : 'bg-green/10 text-green'
      } ${className}`}
    >
      {pickup ? 'Pick Up' : 'Deliver'}
    </span>
  )
}
