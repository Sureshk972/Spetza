// Renders a proof-of-delivery photo from the private `delivery-proof`
// bucket. Unlike PackagePhoto, the bucket is not public -- a drop-off shot
// is someone's doorway -- so every render costs a signed URL. Storage RLS
// limits that to the delivery's sender, its courier, and admins.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const BUCKET = 'delivery-proof'

export default function DeliveryProofPhoto({ path, label = 'Photo at drop-off' }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!path) return
    let cancelled = false
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data?.signedUrl) setFailed(true)
        else setUrl(data.signedUrl)
      })
    return () => { cancelled = true }
  }, [path])

  if (!path || failed) return null

  return (
    <div className="pt-3">
      <div className="text-xs uppercase tracking-wide text-slate/70">{label}</div>
      {url ? (
        <img
          src={url}
          alt={label}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="mt-2 w-full max-h-64 object-cover rounded-lg border border-mist"
          style={{ contentVisibility: 'auto', containIntrinsicSize: '256px' }}
        />
      ) : (
        <div className="mt-2 w-full h-40 rounded-lg border border-mist bg-mist animate-pulse" />
      )}
    </div>
  )
}
