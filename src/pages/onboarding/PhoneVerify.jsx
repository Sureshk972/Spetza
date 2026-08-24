// src/pages/onboarding/PhoneVerify.jsx
//
// Two-step OTP page. Step 1 collects an E.164 phone and calls send-otp.
// Step 2 collects a 6-digit code and calls verify-otp. On success we
// refresh the profile so RequireAuth sees is_phone_verified=true,
// then route to /choose-role (no account_type yet) or to the role
// home.
//
// This is also the A2P 10DLC opt-in page — the one carriers review. Two
// rules govern everything below and must not be quietly relaxed:
//
//   1. The consent checkbox is OPTIONAL. "Send code" and "Verify" work
//      whether or not it is ticked, and it starts unticked. Gating the
//      form on it is the "forced consent" violation (error 30923) that
//      got the campaign rejected on 2026-08-24.
//   2. The consent language sits beside the phone number field, on the
//      same screen, with the mandatory carrier disclosures (brand, message
//      types, frequency, data rates, STOP/HELP, policy links).
//
// The one-time verification code is a separate, user-initiated message —
// tapping "Send code" is its own opt-in — so it sends regardless.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { usePhoneVerification } from '../../hooks/usePhoneVerification.js'
import { normalizePhone } from '../../lib/phone.js'
import { trackEvent } from '../../lib/analytics.js'

const SEND_ERROR_COPY = {
  invalid_phone: "That doesn't look like a valid phone number. Check it and try again.",
  sms_failed: "We couldn't text that number. Check that it's correct and can receive SMS, or try another number.",
  rate_limited: 'Too many code requests for that number. Wait a few minutes and try again.',
}

const VERIFY_ERROR_COPY = {
  code_mismatch: "Code doesn't match. Try again.",
  no_active_challenge: 'That code expired. Tap Resend to get a new one.',
  // phone_in_use is rendered inline as JSX (link to /signin)
}

export default function PhoneVerify() {
  const navigate = useNavigate()
  const { user, profile, refreshProfile, signOut } = useAuth()
  const { status, error, sendCode, verifyCode } = usePhoneVerification()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  // Starts false and stays optional — see the rules in the header comment.
  const [smsConsent, setSmsConsent] = useState(false)

  async function onCancel() {
    // Explicit confirm — the only way out of this screen is signing
    // out (there's no earlier onboarding step to go back to), so make
    // the destructive nature obvious instead of hiding it behind "back".
    const ok = window.confirm(
      'This will sign you out. You can sign back in anytime with the same email. Continue?',
    )
    if (!ok) return
    await signOut()
    navigate('/welcome', { replace: true })
  }

  async function onSend(e) {
    e.preventDefault()
    await sendCode(normalizePhone(phone))
  }

  async function onVerify(e) {
    e.preventDefault()
    const { error: err } = await verifyCode(normalizePhone(phone), code)
    if (err) return

    trackEvent('phone_verification_completed', { phone_provider: 'twilio' })

    // Record the consent decision either way. Writing false explicitly (not
    // leaving it null) keeps the audit trail honest: the user was asked and
    // declined. sms_consent_at is only stamped on an actual opt-in.
    if (hasSupabaseConfig && user?.id) {
      const { error: consentErr } = await supabase
        .from('profiles')
        .update({
          sms_notifications_enabled: smsConsent,
          sms_consent_at: smsConsent ? new Date().toISOString() : null,
        })
        .eq('id', user.id)
      // Non-fatal: a failed preference write must not strand a verified user.
      if (consentErr) console.error('Failed to save SMS consent', consentErr)
    }
    trackEvent('sms_consent_recorded', { opted_in: smsConsent })

    // Refresh so RequireAuth picks up is_phone_verified before we
    // navigate. Route off the FRESHLY-fetched profile — reading the
    // closure's `profile` here is a stale render-time snapshot.
    const fresh = await refreshProfile()

    if (!fresh?.account_type) {
      navigate('/choose-role', { replace: true })
    } else if (fresh.account_type === 'courier') {
      navigate('/courier', { replace: true })
    } else {
      navigate('/sender', { replace: true })
    }
  }

  const showCodeStep =
    status === 'code_sent' || status === 'verifying' || status === 'verify_error'

  return (
    <div className="min-h-full px-6 py-12 max-w-md mx-auto">
      <button
        type="button"
        onClick={onCancel}
        className="text-sm text-slate hover:text-ink"
      >
        Cancel &amp; sign out
      </button>
      <h1 className="font-display text-3xl text-ink mt-6">Verify your phone</h1>
      <p className="text-sm text-slate mt-2">
        We send a 6-digit code to make sure you're a real person. We won't share your number.
      </p>

      {!showCodeStep && (
        <form onSubmit={onSend} className="mt-8 space-y-4">
          <label className="block">
            <div className="text-xs uppercase tracking-widest text-slate mb-2">
              Phone number
            </div>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 123 4567"
              className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-teal focus:outline-none"
            />
          </label>
          {status === 'send_error' && (
            <p className="text-xs text-red-600">
              {SEND_ERROR_COPY[error] || 'Something went wrong. Try again.'}
            </p>
          )}

          {/* A2P 10DLC opt-in. Optional by design — nothing below is gated
              on it, and the "Optional" chip says so in plain sight. */}
          <label className="flex items-start gap-3 p-4 rounded-lg border border-mist bg-white cursor-pointer">
            <input
              type="checkbox"
              checked={smsConsent}
              onChange={(e) => setSmsConsent(e.target.checked)}
              className="mt-0.5 accent-teal shrink-0"
            />
            <span className="text-xs text-slate leading-relaxed">
              <span className="inline-block text-[10px] uppercase tracking-widest text-slate/70 border border-mist rounded px-1.5 py-0.5 mb-1.5">
                Optional
              </span>
              <br />
              I agree to receive text messages from <strong className="text-ink">Spetza</strong> about
              my deliveries — when a courier accepts, arrives, picks up, and drops off — at the
              number above. Message frequency varies. Message and data rates may apply.
              Reply <strong className="text-ink">STOP</strong> to unsubscribe or{' '}
              <strong className="text-ink">HELP</strong> for help. See our{' '}
              <Link to="/privacy" target="_blank" className="text-teal hover:underline">Privacy Policy</Link>
              {' '}and{' '}
              <Link to="/terms" target="_blank" className="text-teal hover:underline">Terms of Service</Link>.
            </span>
          </label>
          <p className="text-xs text-slate/80 -mt-1">
            {profile?.account_type === 'courier'
              ? 'Recommended — texts are the fastest way to hear about nearby jobs. You can skip this and still deliver; we\u2019ll send push notifications instead.'
              : 'You can skip this and still use Spetza. We\u2019ll email you and send push notifications either way.'}
          </p>

          <button
            type="submit"
            disabled={status === 'sending'}
            className="w-full px-4 py-3 rounded-lg bg-ink text-white font-medium hover:bg-teal-light transition-colors disabled:opacity-50"
          >
            {status === 'sending' ? 'Sending…' : 'Send code'}
          </button>
          <p className="text-xs text-slate/70 text-center">
            Tapping &ldquo;Send code&rdquo; sends one verification text to the number above,
            whether or not you check the box. Message and data rates may apply.
          </p>
        </form>
      )}

      {showCodeStep && (
        <form onSubmit={onVerify} className="mt-8 space-y-4">
          <label className="block">
            <div className="text-xs uppercase tracking-widest text-slate mb-2">
              Enter the 6-digit code
            </div>
            <input
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
              className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-teal focus:outline-none text-center text-2xl tracking-widest"
            />
          </label>
          {error === 'phone_in_use' ? (
            <p className="text-xs text-red-600">
              This phone is already linked to another account. Sign out and sign back in with that email.
            </p>
          ) : error ? (
            <p className="text-xs text-red-600">
              {VERIFY_ERROR_COPY[error] || 'Something went wrong. Try again.'}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={status === 'verifying'}
            className="w-full px-4 py-3 rounded-lg bg-ink text-white font-medium hover:bg-teal-light transition-colors disabled:opacity-50"
          >
            {status === 'verifying' ? 'Verifying…' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={() => sendCode(normalizePhone(phone))}
            className="block w-full text-center text-xs text-teal hover:underline"
          >
            Resend code
          </button>
        </form>
      )}
    </div>
  )
}
