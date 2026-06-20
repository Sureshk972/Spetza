import { useState } from 'react'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { stripePromise } from '../lib/stripe.js'
import { supabase } from '../lib/supabase.js'

function CardForm({ onDone }) {
  const stripe = useStripe()
  const elements = useElements()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSaving(true)
    setError(null)
    const { error: confirmErr, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
    })
    if (confirmErr) {
      setError(confirmErr.message)
      setSaving(false)
      return
    }
    const { error: saveErr } = await supabase.functions.invoke(
      'save-sender-payment-method',
      { body: { payment_method_id: setupIntent.payment_method } },
    )
    setSaving(false)
    if (saveErr) {
      setError(saveErr.message)
      return
    }
    onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <PaymentElement />
      {error && <p className="text-sm text-signal">{error}</p>}
      <button
        type="submit"
        disabled={saving || !stripe}
        className="bg-forest text-cream px-4 py-2 rounded-lg disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save card'}
      </button>
    </form>
  )
}

export default function SenderPaymentSection({ profile, onProfileChange }) {
  const [clientSecret, setClientSecret] = useState(null)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState(null)

  async function open() {
    setOpening(true)
    setError(null)
    const { data, error: fnErr } = await supabase.functions.invoke(
      'setup-sender-payment',
    )
    setOpening(false)
    if (fnErr) {
      setError(fnErr.message)
      return
    }
    setClientSecret(data.client_secret)
  }

  if (clientSecret) {
    return (
      <Elements stripe={stripePromise} options={{ clientSecret }}>
        <CardForm
          onDone={() => {
            setClientSecret(null)
            onProfileChange?.()
          }}
        />
      </Elements>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate">
        {profile?.stripe_default_payment_method_id
          ? 'Card saved ✓'
          : 'Add a card to start requesting deliveries.'}
      </p>
      {error && <p className="text-sm text-signal">{error}</p>}
      <button
        onClick={open}
        disabled={opening}
        className="bg-ink text-cream px-4 py-2 rounded-lg disabled:opacity-50"
      >
        {opening
          ? 'Opening…'
          : profile?.stripe_default_payment_method_id
            ? 'Update card'
            : 'Add a card'}
      </button>
    </div>
  )
}
