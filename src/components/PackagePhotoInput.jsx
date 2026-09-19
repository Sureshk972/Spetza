import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { resizeImage } from '../lib/resizeImage.js'
import { uniqueId, isImageFile, imageExt } from '../lib/uploadName.js'

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
    if (!isImageFile(file)) {
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
    const ext = imageExt(uploadFile)
    const objectPath = `${user.id}/${uniqueId()}.${ext}`
    const { error } = await supabase.storage
      .from('package-photos')
      .upload(objectPath, uploadFile, { contentType: uploadFile.type || 'image/jpeg' })
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
            'flex items-center gap-4 px-4 py-4 rounded-xl border-2 border-dashed text-left ' +
            (disabled
              ? 'border-mist bg-white opacity-60'
              : 'border-teal/60 bg-teal/5 hover:bg-teal/10 active:bg-teal/15 cursor-pointer')
          }
        >
          <span className="flex-shrink-0 w-12 h-12 rounded-full bg-teal text-white flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">
              {uploading ? 'Uploading…' : 'Add a photo of the package'}
            </span>
            <span className="block text-xs text-slate mt-0.5">
              Couriers pick faster when they can see the size and shape.
            </span>
          </span>
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
