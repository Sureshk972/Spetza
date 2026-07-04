import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'

const MAX_BYTES = 5 * 1024 * 1024
const BUCKET = 'courier-verification'

const DOCS = [
  { type: 'selfie', label: 'Selfie', hint: 'Face-on photo of you, well-lit.' },
  { type: 'id_front', label: 'ID (front)', hint: 'Government-issued photo ID.' },
  { type: 'id_back', label: 'ID (back)', hint: 'Back of the same document.' },
]

export default function CourierVerify() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [paths, setPaths] = useState({ selfie: null, id_front: null, id_back: null })
  const [uploading, setUploading] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user || !hasSupabaseConfig) return
    supabase
      .from('verification_documents')
      .select('doc_type, storage_path')
      .eq('courier_id', user.id)
      .then(({ data }) => {
        if (!data) return
        const next = { selfie: null, id_front: null, id_back: null }
        for (const d of data) next[d.doc_type] = d.storage_path
        setPaths(next)
      })
  }, [user])

  const status = profile?.verification_status ?? 'unverified'
  const readOnly = status === 'pending' || status === 'approved'
  const allUploaded = paths.selfie && paths.id_front && paths.id_back

  const handleFile = async (docType, e) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (!file.type.startsWith('image/')) {
      toast.error('Pick an image file.')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error('Image must be under 5 MB.')
      return
    }
    setUploading(docType)
    const ext = file.name.split('.').pop() || 'jpg'
    const objectPath = `${user.id}/${docType}-${crypto.randomUUID()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, file, { contentType: file.type })
    if (uploadErr) {
      setUploading(null)
      toast.error(uploadErr.message)
      return
    }

    const previous = paths[docType]
    const { error: dbErr } = await supabase
      .from('verification_documents')
      .upsert(
        { courier_id: user.id, doc_type: docType, storage_path: objectPath, uploaded_at: new Date().toISOString() },
        { onConflict: 'courier_id,doc_type' },
      )
    setUploading(null)
    if (dbErr) {
      toast.error(dbErr.message)
      await supabase.storage.from(BUCKET).remove([objectPath])
      return
    }
    setPaths((p) => ({ ...p, [docType]: objectPath }))
    if (previous) {
      await supabase.storage.from(BUCKET).remove([previous])
    }
  }

  const handleSubmit = async () => {
    if (!allUploaded) {
      toast.error('Upload all three documents.')
      return
    }
    setSubmitting(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        verification_status: 'pending',
        verification_submitted_at: new Date().toISOString(),
        verification_notes: null,
      })
      .eq('id', user.id)
    setSubmitting(false)
    if (error) {
      toast.error(error.message)
      return
    }
    await refreshProfile()
    toast.success('Submitted for review.')
    navigate('/courier')
  }

  return (
    <div className="min-h-full px-6 py-12 max-w-xl mx-auto">
      <div className="text-xs uppercase tracking-widest text-forest">Courier</div>
      <h1 className="font-serif text-3xl text-ink mt-1">Verify your identity</h1>
      <p className="text-slate mt-3">
        Upload three photos. A team member reviews within a business day.
      </p>

      {status === 'pending' && (
        <div className="mt-6 p-4 rounded-xl bg-signal/10 text-signal text-sm">
          Submitted. We'll notify you when review is complete.
        </div>
      )}
      {status === 'approved' && (
        <div className="mt-6 p-4 rounded-xl bg-forest/10 text-forest text-sm">
          Approved. You can accept deliveries.
        </div>
      )}
      {status === 'rejected' && (
        <div className="mt-6 p-4 rounded-xl bg-red-50 text-red-700 text-sm">
          <div className="font-medium">Not approved</div>
          {profile?.verification_notes && (
            <div className="mt-1 text-red-600/80">{profile.verification_notes}</div>
          )}
          <div className="mt-2 text-red-600/80">Replace any documents and resubmit.</div>
        </div>
      )}

      <div className="mt-8 space-y-4">
        {DOCS.map((doc) => {
          const uploaded = !!paths[doc.type]
          const busy = uploading === doc.type
          return (
            <div key={doc.type} className="p-4 rounded-xl border border-mist bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-ink text-sm">{doc.label}</div>
                  <div className="text-slate text-xs mt-0.5">{doc.hint}</div>
                </div>
                {uploaded && !busy && (
                  <span className="text-xs text-forest">Uploaded ✓</span>
                )}
              </div>
              {!readOnly && (
                <label className="mt-3 block px-4 py-3 rounded-lg border-2 border-dashed border-mist text-center text-sm text-slate hover:border-signal hover:text-ink cursor-pointer">
                  {busy
                    ? 'Uploading…'
                    : uploaded
                    ? 'Replace'
                    : 'Tap to upload (up to 5 MB)'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFile(doc.type, e)}
                    disabled={busy}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          )
        })}
      </div>

      {status !== 'approved' && status !== 'pending' && (
        <button
          onClick={handleSubmit}
          disabled={!allUploaded || submitting}
          className="mt-8 w-full px-4 py-3 rounded-lg bg-forest text-cream text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit for review'}
        </button>
      )}
    </div>
  )
}
