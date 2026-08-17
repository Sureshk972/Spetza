import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { resizeImage } from '../lib/resizeImage.js'

const MAX_BYTES = 15 * 1024 * 1024 // raw camera photos can top 10 MB; we resize before upload

function publicUrl(path) {
  if (!path) return null
  const { data } = supabase.storage.from('package-photos').getPublicUrl(path)
  return data.publicUrl
}

export default function PackagePhotoInput({ path, onChange, disabled }) {
  const { user } = useAuth()
  const [uploading, setUploading] = useState(false)
  const url = publicUrl(path)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (!file.type.startsWith('image/')) {
      toast.error('Pick an image file.')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error('Image must be under 15 MB.')
      return
    }
    setUploading(true)
    let uploadFile = file
    try {
      uploadFile = await resizeImage(file)
    } catch {
      // resize failed — fall back to raw upload rather than blocking the flow
    }
    const ext = uploadFile.type === 'image/jpeg'
      ? 'jpg'
      : (uploadFile.name.split('.').pop() || 'jpg')
    const objectPath = `${user.id}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage
      .from('package-photos')
      .upload(objectPath, uploadFile, { contentType: uploadFile.type })
    setUploading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    onChange(objectPath)
  }

  async function clear() {
    if (!path) return
    await supabase.storage.from('package-photos').remove([path])
    onChange(null)
  }

  return (
    <div>
      {url ? (
        <div className="flex items-start gap-4">
          <img
            src={url}
            alt="Package"
            className="w-32 h-32 object-cover rounded-lg border border-mist"
          />
          {!disabled && (
            <div className="space-y-2 text-sm">
              <label className="block">
                <span className="text-teal cursor-pointer hover:underline">
                  Replace photo
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFile}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={clear}
                className="block text-slate hover:text-ink"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      ) : (
        <label
          className={
            'block px-4 py-6 rounded-lg border-2 border-dashed text-center text-sm ' +
            (disabled
              ? 'border-mist text-slate opacity-60'
              : 'border-mist text-slate hover:border-teal hover:text-ink cursor-pointer')
          }
        >
          {uploading ? 'Uploading…' : 'Tap to add a photo of the package'}
          <input
            type="file"
            accept="image/*"
            onChange={handleFile}
            disabled={uploading || disabled}
            className="hidden"
          />
        </label>
      )}
    </div>
  )
}
