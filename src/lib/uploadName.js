// Object names for uploaded photos. Kept separate from any one screen so the
// drop-off proof, package photo and selfie all behave the same on every phone.

// crypto.randomUUID is missing on older Android WebViews; never let a missing
// helper stop a courier finishing a delivery.
export function uniqueId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID() } catch { /* fall through */ }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// Some Android cameras hand the file over with an empty MIME type. Treat
// "no type" as a JPEG rather than rejecting the photo.
export function isImageFile(file) {
  if (!file) return false
  if (file.type) return file.type.startsWith('image/')
  return /\.(jpe?g|png|heic|heif|webp)$/i.test(file.name || '') || file.name === '' || file.name == null
}

export function imageExt(file) {
  const t = (file?.type || '').toLowerCase()
  if (t === 'image/jpeg' || t === '') return 'jpg'
  if (t === 'image/png') return 'png'
  if (t === 'image/webp') return 'webp'
  if (t === 'image/heic' || t === 'image/heif') return 'heic'
  const fromName = (file?.name || '').split('.').pop()
  return fromName && fromName !== file?.name ? fromName.toLowerCase() : 'jpg'
}
