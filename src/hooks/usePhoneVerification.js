// src/hooks/usePhoneVerification.js
//
// Drives the OTP UI. Status machine:
//   idle → sending → code_sent → verifying → verified
//              ↘ send_error              ↘ verify_error
//
// send_error and verify_error are split so the UI can keep the user
// on the correct form: send failures must NOT drop them onto the
// code-entry screen, because no code was ever sent.

import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export function usePhoneVerification() {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  async function sendCode(phone) {
    setStatus('sending')
    setError(null)
    const { data, error } = await supabase.functions.invoke('send-otp', { body: { phone } })
    if (error || !data?.ok) {
      setStatus('send_error')
      setError(data?.error || error?.message || 'send_failed')
      return { error: error ?? new Error(data?.error || 'send_failed') }
    }
    setStatus('code_sent')
    return { error: null }
  }

  async function verifyCode(phone, code) {
    setStatus('verifying')
    setError(null)
    const { data, error } = await supabase.functions.invoke('verify-otp', { body: { phone, code } })
    if (error || !data?.ok) {
      setStatus('verify_error')
      setError(data?.error || error?.message || 'verify_failed')
      return { error: error ?? new Error(data?.error || 'verify_failed') }
    }
    setStatus('verified')
    return { data, error: null }
  }

  function reset() {
    setStatus('idle')
    setError(null)
  }

  return { status, error, sendCode, verifyCode, reset }
}
