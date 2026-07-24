import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'

const MAX_BYTES = 5 * 1024 * 1024
const BUCKET = 'courier-verification'

export default function CourierVerify() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [uploading, setUploading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [selfiePath, setSelfiePath] = useState(profile?.selfie_path ?? null)

  useEffect(() => {
    setSelfiePath(profile?.selfie_path ?? null)
  }, [profile?.selfie_path])

  const bg = profile?.background_check_status ?? 'not_started'
  const payoutsReady =
    profile?.stripe_connect_charges_enabled && profile?.stripe_connect_payouts_enabled

  const onSelfie = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (!file.type.startsWith('image/')) { toast.error('Pick an image file.'); return }
    if (file.size > MAX_BYTES) { toast.error('Image must be under 5 MB.'); return }
    setUploading(true)
    const ext = file.name.split('.').pop() || 'jpg'
    const objectPath = `${user.id}/selfie-${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from(BUCKET).upload(objectPath, file, { contentType: file.type })
    if (upErr) { setUploading(false); toast.error(upErr.message); return }
    const previous = selfiePath
    const { error: dbErr } = await supabase
      .from('profiles').update({ selfie_path: objectPath }).eq('id', user.id)
    setUploading(false)
    if (dbErr) {
      toast.error(dbErr.message)
      await supabase.storage.from(BUCKET).remove([objectPath])
      return
    }
    setSelfiePath(objectPath)
    if (previous) await supabase.storage.from(BUCKET).remove([previous])
    await refreshProfile()
  }

  const startCheck = async () => {
    setStarting(true)
    const { data, error } = await supabase.functions.invoke('start-background-check')
    setStarting(false)
    if (error) { toast.error(error.message); return }
    if (data?.invitation_url) {
      window.location.href = data.invitation_url
    } else {
      toast.error('Could not start the check. Try again.')
    }
  }

  if (!hasSupabaseConfig) {
    return <div className="min-h-full px-6 py-12 max-w-xl mx-auto text-slate">Supabase not configured.</div>
  }

  return (
    <div className="min-h-full px-6 py-12 max-w-xl mx-auto">
      <div className="text-xs uppercase tracking-widest text-signal">Courier</div>
      <h1 className="font-serif text-3xl text-ink mt-1">Get verified</h1>
      <p className="text-slate mt-3">
        Three quick steps: a selfie, your payout account, and a background check.
      </p>

      {/* Step 1: selfie */}
      <section className="mt-8 p-4 rounded-xl border border-mist bg-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-ink text-sm">1 · Selfie</div>
            <div className="text-slate text-xs mt-0.5">A clear, face-on photo. Recipients see this.</div>
          </div>
          {selfiePath && <span className="text-xs text-forest">Uploaded ✓</span>}
        </div>
        <label className="mt-3 block px-4 py-3 rounded-lg border-2 border-dashed border-mist text-center text-sm text-slate hover:border-signal hover:text-ink cursor-pointer">
          {uploading ? 'Uploading…' : selfiePath ? 'Replace selfie' : 'Tap to upload (up to 5 MB)'}
          <input type="file" accept="image/*" onChange={onSelfie} disabled={uploading} className="hidden" />
        </label>
      </section>

      {/* Step 2: payouts (link to profile where CourierConnectSection lives) */}
      <section className="mt-4 p-4 rounded-xl border border-mist bg-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-ink text-sm">2 · Payout account</div>
            <div className="text-slate text-xs mt-0.5">Set up Stripe to get paid. This also verifies your identity.</div>
          </div>
          {payoutsReady
            ? <span className="text-xs text-forest">Connected ✓</span>
            : <button onClick={() => navigate('/courier/profile')} className="text-xs text-signal hover:underline">Set up →</button>}
        </div>
      </section>

      {/* Step 3: background check */}
      <section className="mt-4 p-4 rounded-xl border border-mist bg-white">
        <div className="text-ink text-sm">3 · Background check</div>
        {bg === 'clear' ? (
          <div className="mt-2 p-3 rounded-lg bg-forest/10 text-forest text-sm">Cleared ✓ You can accept deliveries.</div>
        ) : bg === 'pending' ? (
          <div className="mt-2 p-3 rounded-lg bg-signal/10 text-signal text-sm">In progress. We'll update this when it's done.</div>
        ) : bg === 'consider' ? (
          <div className="mt-2 p-3 rounded-lg bg-signal/10 text-signal text-sm">Under review. We'll be in touch.</div>
        ) : bg === 'rejected' ? (
          <div className="mt-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">Not approved. Check your email from Checkr for details.</div>
        ) : (
          <>
            <div className="text-slate text-xs mt-0.5">Runs through Checkr. Free to you.</div>
            <button
              onClick={startCheck}
              disabled={!selfiePath || !payoutsReady || starting}
              className="mt-3 w-full px-4 py-3 rounded-lg bg-forest text-cream text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {starting ? 'Starting…' : 'Start background check'}
            </button>
            {(!selfiePath || !payoutsReady) && (
              <div className="text-xs text-slate mt-2">Finish steps 1 and 2 first.</div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
