// src/pages/onboarding/PhoneVerify.jsx
//
// Two-step OTP page. Step 1 collects an E.164 phone and calls send-otp.
// Step 2 collects a 6-digit code and calls verify-otp. On success we
// refresh the profile so RequireAuth sees is_phone_verified=true,
// then route to /choose-role (no account_type yet) or to the role
// home.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { usePhoneVerification } from '../../hooks/usePhoneVerification.js'
import { normalizePhone } from '../../lib/phone.js'

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
  const { profile, refreshProfile, signOut } = useAuth()
  const { status, error, sendCode, verifyCode } = usePhoneVerification()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')

  async function onCancel() {
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

    // Refresh so RequireAuth picks up is_phone_verified before we
    // navigate; otherwise the next route bounces us back here.
    await refreshProfile()

    if (!profile?.account_type) {
      navigate('/choose-role', { replace: true })
    } else if (profile.account_type === 'courier') {
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
        &larr; back
      </button>
      <h1 className="font-serif text-3xl text-ink mt-6">Verify your phone</h1>
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
              className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
            />
          </label>
          {status === 'send_error' && (
            <p className="text-xs text-signal">
              {SEND_ERROR_COPY[error] || 'Something went wrong. Try again.'}
            </p>
          )}
          <button
            type="submit"
            disabled={status === 'sending'}
            className="w-full px-4 py-3 rounded-lg bg-ink text-cream font-medium hover:bg-signal transition-colors disabled:opacity-50"
          >
            {status === 'sending' ? 'Sending…' : 'Send code'}
          </button>
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
              className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none text-center text-2xl tracking-widest"
            />
          </label>
          {error === 'phone_in_use' ? (
            <p className="text-xs text-signal">
              This phone is already linked to another account.{' '}
              <Link to="/signin" className="underline">
                Sign in instead?
              </Link>
            </p>
          ) : error ? (
            <p className="text-xs text-signal">
              {VERIFY_ERROR_COPY[error] || 'Something went wrong. Try again.'}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={status === 'verifying'}
            className="w-full px-4 py-3 rounded-lg bg-ink text-cream font-medium hover:bg-signal transition-colors disabled:opacity-50"
          >
            {status === 'verifying' ? 'Verifying…' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={() => sendCode(normalizePhone(phone))}
            className="block w-full text-center text-xs text-signal hover:underline"
          >
            Resend code
          </button>
        </form>
      )}
    </div>
  )
}
