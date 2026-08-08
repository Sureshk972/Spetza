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
  const [selfieUrl, setSelfieUrl] = useState(null)

  useEffect(() => {
    setSelfiePath(profile?.selfie_path ?? null)
  }, [profile?.selfie_path])

  // Fetch a signed URL whenever selfiePath changes
  useEffect(() => {
    if (!selfiePath) { setSelfieUrl(null); return }
    let cancelled = false
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(selfiePath, 3600) // 1 hour
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setSelfieUrl(data.signedUrl)
      })
    return () => { cancelled = true }
  }, [selfiePath])

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
    // TODO: wire up Checkr when ready for production couriers
    // For now, auto-approve so the full flow can be tested end-to-end.
    const { error } = await supabase
      .from('profiles')
      .update({
        background_check_status: 'clear',
        background_check_updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
    setStarting(false)
    if (error) { toast.error(error.message); return }
    toast.success('Background check approved.')
    await refreshProfile()
  }

  if (!hasSupabaseConfig) {
    return <div className="min-h-full px-6 py-12 max-w-xl mx-auto text-slate">Supabase not configured.</div>
  }

  return (
    <div className="min-h-full px-6 py-12 max-w-xl mx-auto">
      <div className="text-xs uppercase tracking-widest text-teal">Courier</div>
      <h1 className="font-display text-3xl text-ink mt-1">Get verified</h1>
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
          {selfiePath && <span className="text-xs text-green">Uploaded ✓</span>}
        </div>
        {selfieUrl && (
          <div className="mt-3 flex justify-center">
            <img
              src={selfieUrl}
              alt="Your selfie"
              className="w-24 h-24 rounded-full object-cover border-2 border-mist"
            />
          </div>
        )}
        <label className={`${selfieUrl ? 'mt-2' : 'mt-3'} block px-4 py-3 rounded-lg border-2 border-dashed border-mist text-center text-sm text-slate hover:border-teal hover:text-ink cursor-pointer`}>
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
            ? <span className="text-xs text-green">Connected ✓</span>
            : <button onClick={() => navigate('/courier/profile')} className="text-xs text-teal hover:underline">Set up →</button>}
        </div>
      </section>

      {/* Step 3: background check */}
      <section className="mt-4 p-4 rounded-xl border border-mist bg-white">
        <div className="text-ink text-sm">3 · Background check</div>
        {bg === 'clear' ? (
          <div className="mt-2 p-3 rounded-lg bg-green/10 text-green text-sm">Cleared ✓ You can accept deliveries.</div>
        ) : bg === 'pending' ? (
          <div className="mt-2 p-3 rounded-lg bg-teal/10 text-teal text-sm">In progress. We'll update this when it's done.</div>
        ) : bg === 'consider' ? (
          <div className="mt-2 p-3 rounded-lg bg-teal/10 text-teal text-sm">Under review. We'll be in touch.</div>
        ) : bg === 'rejected' ? (
          <div className="mt-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">Not approved. Check your email from Checkr for details.</div>
        ) : (
          <>
            <div className="text-slate text-xs mt-0.5">Runs through Checkr. Free to you.</div>
            <button
              onClick={startCheck}
              disabled={!selfiePath || !payoutsReady || starting}
              className="mt-3 w-full px-4 py-3 rounded-lg bg-green text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {starting ? 'Starting…' : 'Start background check'}
            </button>
            {(!selfiePath || !payoutsReady) && (
              <div className="text-xs text-slate mt-2">Finish steps 1 and 2 first.</div>
            )}
          </>
        )}
      </section>

      {/* All done — celebrate and guide to Discover */}
      {selfiePath && payoutsReady && bg === 'clear' && (
        <section className="mt-8 p-6 rounded-xl bg-green/10 border border-green/20 text-center">
          <div className="text-4xl">🎉</div>
          <h2 className="font-display text-2xl text-ink mt-3">You're all set!</h2>
          <p className="text-slate mt-2 leading-relaxed">
            You're verified and ready to earn. Head to Discover to see delivery
            requests near you — accept one and start delivering.
          </p>
          <button
            onClick={() => navigate('/courier')}
            className="mt-4 px-6 py-3 rounded-lg bg-ink text-white font-medium hover:bg-teal transition-colors"
          >
            Browse deliveries →
          </button>
        </section>
      )}
    </div>
  )
}
