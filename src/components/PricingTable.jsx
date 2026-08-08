import { TIERS, PLATFORM_FEE_BPS } from '../lib/pricing.js'

const feePercent = PLATFORM_FEE_BPS / 100

export default function PricingTable({ variant = 'sender' }) {
  return (
    <div className="rounded-xl border border-mist bg-white p-4">
      <div className="text-xs uppercase tracking-widest text-slate mb-3">Pricing</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate/70">
            <th className="text-left pb-2 font-normal">Distance</th>
            <th className="text-right pb-2 font-normal">
              {variant === 'courier' ? 'Delivery pay' : 'Delivery price'}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-mist">
          {TIERS.map((t, i) => {
            const low = i === 0 ? 0 : TIERS[i - 1].upTo
            return (
              <tr key={t.upTo}>
                <td className="py-2 text-ink">{low}–{t.upTo} mi</td>
                <td className="py-2 text-ink text-right font-medium">
                  ${(t.cents / 100).toFixed(2)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-3 pt-3 border-t border-mist text-xs text-slate">
        {variant === 'courier'
          ? `A ${feePercent}% platform fee is deducted from each delivery.`
          : `A ${feePercent}% service fee is added to each delivery.`}
      </div>
    </div>
  )
}
