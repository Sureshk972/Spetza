// "Your rating" panel for the current user's Profile page.
// Big average + count, plus recent comments so they can see what
// counterparties are actually saying about them.

import { useEffect, useState } from 'react'
import { supabase, hasSupabaseConfig } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'

function StarRow({ n }) {
  return (
    <span className="inline-flex gap-0.5 text-2xl leading-none" aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= Math.round(n) ? 'text-teal' : 'text-slate/25'}>
          ★
        </span>
      ))}
    </span>
  )
}

function reviewDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function MyRatingSummary() {
  const { user, profile } = useAuth()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!hasSupabaseConfig || !user) {
        setLoading(false)
        return
      }
      // Pull the most recent ratings with comments so we can show what
      // counterparties actually wrote. RLS allows read.
      const { data } = await supabase
        .from('ratings')
        .select('stars, comment, created_at')
        .eq('ratee_id', user.id)
        .not('comment', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5)
      if (cancelled) return
      setComments(data ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [user])

  const avg = Number(profile?.rating_avg ?? 0)
  const count = profile?.rating_count ?? 0

  return (
    <section className="space-y-3">
      <h2 className="text-xs uppercase tracking-widest text-slate">Your rating</h2>
      <div className="rounded-xl border border-mist bg-white p-5">
        {count === 0 ? (
          <div className="text-sm text-slate">
            No ratings yet. Your average will appear here after your first completed delivery.
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-3">
              <span className="font-display text-4xl text-ink">{avg.toFixed(1)}</span>
              <StarRow n={avg} />
              <span className="text-sm text-slate">({count} {count === 1 ? 'rating' : 'ratings'})</span>
            </div>
            {!loading && comments.length > 0 && (
              <div className="mt-4 pt-4 border-t border-mist space-y-3">
                <div className="text-[10px] uppercase tracking-widest text-slate/60 font-bold">Recent comments</div>
                {comments.map((c, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-teal">
                        {'★'.repeat(c.stars)}<span className="text-slate/25">{'★'.repeat(5 - c.stars)}</span>
                      </span>
                      <span className="text-slate/60">{reviewDate(c.created_at)}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate italic leading-relaxed">"{c.comment}"</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
