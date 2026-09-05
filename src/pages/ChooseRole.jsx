import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { trackEvent } from '../lib/analytics.js'
import Footer from '../components/Footer.jsx'

/**
 * The one screen where someone says how they'll use Spetza.
 *
 * This used to auto-commit: Welcome stashed `spetza:intended_role` when someone
 * tapped a call-to-action, and this page read it on mount and chose for them.
 * Two couriers in a row came out as senders and never saw this screen, because
 * the first button on the marketing page is the sender one and tapping it is
 * how you get to signup at all. The stash also outlived the visit, so browsing
 * the marketing page in June could decide your role in July.
 *
 * The stash now only pre-selects. Committing takes a deliberate tap, because
 * the choice decides the whole shape of the product and nothing in the app
 * changes it afterwards.
 */

const ROLES = [
  {
    key: 'sender',
    eyebrow: 'Sender',
    title: 'I need something delivered',
    blurb: 'Post a pickup and dropoff, and a nearby courier will take it from here.',
    eyebrowClass: 'text-teal',
    selectedClass: 'border-teal bg-teal/5 shadow-md',
    tickClass: 'bg-teal',
  },
  {
    key: 'courier',
    eyebrow: 'Courier',
    title: 'I want to earn delivering',
    blurb: 'See open requests near you. Accept the ones that fit your route.',
    eyebrowClass: 'text-green',
    selectedClass: 'border-green bg-green/5 shadow-md',
    tickClass: 'bg-green',
  },
]

export default function ChooseRole() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)

  // Already decided: nothing to do here. Rendering a redirect rather than
  // calling navigate() mid-render keeps React from warning about it.
  if (profile?.account_type === 'sender') return <Navigate to="/sender" replace />
  if (profile?.account_type === 'courier') return <Navigate to="/courier" replace />

  const commit = async () => {
    if (!selected || busy) return
    if (!hasSupabaseConfig) {
      toast.error('Supabase not configured.')
      return
    }

    setBusy(true)
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, account_type: selected, updated_at: new Date().toISOString() })
    setBusy(false)

    if (error) {
      // Stale session — the auth.users row was deleted (e.g. admin cleanup) but
      // the client still holds a valid JWT. Sign out and start again rather
      // than looping on the same foreign-key violation forever.
      if (error.code === '23503' || /profiles_id_fkey/.test(error.message)) {
        toast.error('Your session is out of date. Please sign in again.')
        await supabase.auth.signOut()
        navigate('/signup', { replace: true })
        return
      }
      toast.error(error.message)
      return
    }

    trackEvent('role_selected', { role: selected })
    await refreshProfile()
    navigate(selected === 'sender' ? '/sender' : '/courier', { replace: true })
  }

  return (
    <div className="min-h-full flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl">
        <h1 className="font-display text-3xl text-ink text-center">How will you use Spetza?</h1>
        <p className="text-slate text-center mt-2">
          Pick one to get started. You can't change this yourself later, so choose the one you
          actually want.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mt-10">
          {ROLES.map((role) => {
            const on = selected === role.key
            return (
              <button
                key={role.key}
                type="button"
                aria-pressed={on}
                onClick={() => setSelected(role.key)}
                disabled={busy}
                className={`text-left p-6 rounded-2xl border-2 transition-all disabled:opacity-50 ${
                  on ? role.selectedClass : 'border-mist hover:border-slate/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className={`text-xs uppercase tracking-widest ${role.eyebrowClass}`}>
                    {role.eyebrow}
                  </div>
                  {on && (
                    <span
                      aria-hidden="true"
                      className={`h-5 w-5 rounded-full ${role.tickClass} text-white text-xs flex items-center justify-center`}
                    >
                      ✓
                    </span>
                  )}
                </div>
                <div className="font-display text-2xl text-ink mt-2">{role.title}</div>
                <p className="text-slate mt-3 text-sm">{role.blurb}</p>
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={commit}
          disabled={!selected || busy}
          className="w-full mt-6 py-4 rounded-xl bg-ink text-white font-display font-bold text-lg transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy
            ? 'Saving…'
            : selected
              ? `Continue as ${selected === 'sender' ? 'a sender' : 'a courier'}`
              : 'Pick one to continue'}
        </button>

        <Footer />
      </div>
    </div>
  )
}
