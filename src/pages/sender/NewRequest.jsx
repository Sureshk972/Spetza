import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'

export default function NewRequest() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pickup, setPickup] = useState('')
  const [dropoff, setDropoff] = useState('')
  const [description, setDescription] = useState('')
  const [priceDollars, setPriceDollars] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!hasSupabaseConfig) {
      toast.error('Supabase not configured.')
      return
    }
    const cents = Math.round(Number(priceDollars) * 100)
    if (!Number.isFinite(cents) || cents <= 0) {
      toast.error('Enter a valid price.')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.from('delivery_requests').insert({
      sender_id: user.id,
      pickup_address: pickup,
      dropoff_address: dropoff,
      package_description: description,
      max_price_cents: cents,
    })
    setSubmitting(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Request posted.')
    navigate('/sender')
  }

  return (
    <div className="min-h-full px-6 py-12 max-w-xl mx-auto">
      <Link to="/sender" className="text-sm text-slate hover:text-ink">&larr; back</Link>
      <h1 className="font-serif text-3xl text-ink mt-6">New delivery request</h1>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <Field label="Pickup address">
          <input
            type="text"
            required
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            placeholder="123 Main St"
            className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
          />
        </Field>
        <Field label="Dropoff address">
          <input
            type="text"
            required
            value={dropoff}
            onChange={(e) => setDropoff(e.target.value)}
            placeholder="456 Oak Ave"
            className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
          />
        </Field>
        <Field label="Package description">
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Small box, under 5 lbs. Fragile."
            rows={3}
            className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
          />
        </Field>
        <Field label="Max price (USD)">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate">$</span>
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
              placeholder="15.00"
              className="w-full pl-8 pr-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
            />
          </div>
        </Field>
        <button
          type="submit"
          disabled={submitting}
          className="w-full px-4 py-3 rounded-lg bg-ink text-cream font-medium hover:bg-signal transition-colors disabled:opacity-50"
        >
          {submitting ? 'Posting…' : 'Post request'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-slate mb-2">{label}</div>
      {children}
    </label>
  )
}
