import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase.js'

const PRESETS = [200, 500, 1000] // cents

function dollars(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

export default function TipPrompt({ request, courierName, onTipped }) {
  const [selected, setSelected] = useState(null) // cents or 'custom'
  const [custom, setCustom] = useState('')
  const [sending, setSending] = useState(false)

  // Already tipped
  if (request.tip_cents) {
    return (
      <div className="text-center py-2">
        <div className="text-xs uppercase tracking-widest text-green font-bold">Tip sent</div>
        <div className="font-display text-2xl text-ink mt-1">{dollars(request.tip_cents)}</div>
        <p className="text-xs text-slate mt-1">Thank you for tipping {courierName}!</p>
      </div>
    )
  }

  // Check 48-hour window
  const deliveredAt = new Date(request.delivered_at).getTime()
  const hoursAgo = (Date.now() - deliveredAt) / (1000 * 60 * 60)
  if (hoursAgo > 48) return null

  const tipCents =
    selected === 'custom'
      ? Math.round(parseFloat(custom || '0') * 100)
      : selected

  const valid = tipCents >= 100 && tipCents <= 10000

  const handleSend = async () => {
    if (!valid) {
      toast.error('Tip must be between $1 and $100.')
      return
    }
    setSending(true)
    const { error } = await supabase.functions.invoke('send-tip', {
      body: { delivery_request_id: request.id, tip_cents: tipCents },
    })
    setSending(false)
    if (error) {
      toast.error(error.message || 'Could not send tip. Try again.')
      return
    }
    toast.success(`${dollars(tipCents)} tip sent to ${courierName}!`)
    onTipped?.()
  }

  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-slate">Thank your courier</div>
      <p className="text-sm text-slate mt-1">
        Add a tip for {courierName}? 100% goes to them.
      </p>

      <div className="mt-3 flex gap-2">
        {PRESETS.map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => { setSelected(amt); setCustom('') }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              selected === amt
                ? 'bg-ink text-white'
                : 'bg-mist text-ink hover:bg-teal/10'
            }`}
          >
            {dollars(amt)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSelected('custom')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            selected === 'custom'
              ? 'bg-ink text-white'
              : 'bg-mist text-ink hover:bg-teal/10'
          }`}
        >
          Other
        </button>
      </div>

      {selected === 'custom' && (
        <div className="mt-3 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate text-sm">$</span>
          <input
            type="number"
            inputMode="decimal"
            min="1"
            max="100"
            step="0.01"
            autoFocus
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="0.00"
            className="w-full pl-7 pr-4 py-2.5 rounded-lg bg-mist border border-mist focus:border-teal focus:outline-none text-sm"
          />
        </div>
      )}

      {selected != null && (
        <button
          type="button"
          onClick={handleSend}
          disabled={!valid || sending}
          className="mt-3 w-full py-3 rounded-lg bg-green text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {sending
            ? 'Sending…'
            : valid
            ? `Send ${dollars(tipCents)} tip`
            : 'Enter an amount'}
        </button>
      )}
    </div>
  )
}
