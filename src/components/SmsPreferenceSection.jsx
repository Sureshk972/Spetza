// Text-message preference panel for both Profile pages.
//
// A2P 10DLC reviewers look for a standing, self-serve way to opt out that
// isn't "reply STOP" — so this mirrors the opt-in on /verify-phone and can
// be toggled either direction at any time. Consent is expressed by
// sms_notifications_enabled === true; sms_consent_at is the audit stamp.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function SmsPreferenceSection() {
  const { user, profile, refreshProfile } = useAuth()
  const [saving, setSaving] = useState(false)

  const enabled = profile?.sms_notifications_enabled === true
  const hasPhone = Boolean(profile?.phone_number)

  async function toggle(next) {
    if (!hasSupabaseConfig || !user?.id) return
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        sms_notifications_enabled: next,
        sms_consent_at: next ? new Date().toISOString() : null,
      })
      .eq('id', user.id)
    setSaving(false)
    if (error) {
      toast.error("Couldn't save that. Try again.")
      return
    }
    await refreshProfile()
    toast.success(next ? 'Text messages on.' : 'Text messages off.')
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xs uppercase tracking-widest text-slate">Text messages</h2>
      <div className="rounded-xl border border-mist bg-white p-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving || !hasPhone}
            onChange={(e) => toggle(e.target.checked)}
            className="mt-1 accent-teal shrink-0 disabled:opacity-40"
          />
          <span className="text-sm text-ink leading-relaxed">
            Text me about my deliveries
            <span className="block text-xs text-slate leading-relaxed mt-1.5">
              Updates from Spetza when a courier accepts, arrives, picks up, and drops off.
              Message frequency varies. Message and data rates may apply.
              Reply <strong className="text-ink">STOP</strong> to unsubscribe or{' '}
              <strong className="text-ink">HELP</strong> for help. See our{' '}
              <Link to="/privacy" className="text-teal hover:underline">Privacy Policy</Link>
              {' '}and{' '}
              <Link to="/terms" className="text-teal hover:underline">Terms of Service</Link>.
            </span>
          </span>
        </label>

        {!hasPhone && (
          <p className="text-xs text-slate/80 mt-3 pt-3 border-t border-mist">
            Verify a phone number first to turn this on.
          </p>
        )}
        {hasPhone && (
          <p className="text-xs text-slate/80 mt-3 pt-3 border-t border-mist">
            {enabled
              ? `Texting ${profile.phone_number}. Turn this off anytime — you'll still get email and push notifications.`
              : "Off. You'll still get email and push notifications for every delivery."}
          </p>
        )}
      </div>
    </section>
  )
}
