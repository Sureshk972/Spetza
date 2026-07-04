import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase.js'

function Star({ filled, onClick, onHover, onLeave }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className="text-2xl leading-none px-0.5"
      aria-label="star"
    >
      <span className={filled ? 'text-signal' : 'text-slate/40'}>★</span>
    </button>
  )
}

export default function RatingPrompt({ request, raterId, rateeId, rateeLabel, onSubmitted }) {
  const [stars, setStars] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (stars === 0) {
      toast.error('Pick a star rating.')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.from('ratings').insert({
      delivery_request_id: request.id,
      rater_id: raterId,
      ratee_id: rateeId,
      stars,
      comment: comment.trim() || null,
    })
    setSubmitting(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Thanks for the feedback.')
    onSubmitted?.()
  }

  return (
    <div className="mt-3 pt-3 border-t border-mist">
      <div className="text-xs uppercase tracking-widest text-slate">
        Rate your {rateeLabel}
      </div>
      <div className="mt-2 flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            filled={n <= (hover || stars)}
            onClick={() => setStars(n)}
            onHover={() => setHover(n)}
            onLeave={() => setHover(0)}
          />
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Anything to add? (optional)"
        rows={2}
        className="mt-2 w-full px-3 py-2 rounded-lg bg-mist text-sm focus:outline-none"
      />
      <div className="mt-2 flex justify-end">
        <button
          onClick={submit}
          disabled={submitting || stars === 0}
          className="px-3 py-1.5 rounded-lg bg-forest text-cream text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit rating'}
        </button>
      </div>
    </div>
  )
}
