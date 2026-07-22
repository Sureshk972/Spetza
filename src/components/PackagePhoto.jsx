import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

// Renders a package photo from the `package-photos` storage bucket.
// Hides itself entirely if the URL 404s (stale path where the file
// was removed from storage but delivery_requests.package_photo_path
// still points at it).
export default function PackagePhoto({ path, variant = 'block', alt = 'Package photo' }) {
  const [failed, setFailed] = useState(false)
  if (!path || failed) return null
  const url = supabase.storage.from('package-photos').getPublicUrl(path).data.publicUrl

  if (variant === 'thumbnail') {
    return (
      <img
        src={url}
        alt={alt}
        onError={() => setFailed(true)}
        className="w-20 h-20 object-cover rounded-lg border border-mist shrink-0"
      />
    )
  }

  return (
    <div className="pt-3">
      <div className="text-xs uppercase tracking-wide text-slate/70">Photo</div>
      <img
        src={url}
        alt={alt}
        onError={() => setFailed(true)}
        className="mt-2 w-full max-h-64 object-cover rounded-lg border border-mist"
      />
    </div>
  )
}
