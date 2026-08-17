// Downscale an image file to a max longest-edge, re-encode as JPEG.
// Turns 3-4 MB iPhone photos into ~200-400 KB deliveries, without visibly
// hurting quality. Called from PackagePhotoInput before upload so we never
// ship raw camera output to storage — the app was freezing on scroll while
// the browser decoded full-res <img> tags.

const MAX_EDGE = 1600
const QUALITY = 0.85

export async function resizeImage(file) {
  // If it's already small, don't bother re-encoding
  if (file.size < 400 * 1024) return file

  const bitmap = await createBitmapCompat(file)
  const { width, height } = bitmap

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
  if (scale === 1 && file.type === 'image/jpeg') return file

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  )
  if (!blob) return file

  // Preserve the original filename stem, force .jpg
  const stem = (file.name.split('.').slice(0, -1).join('.') || 'photo')
  return new File([blob], `${stem}.jpg`, { type: 'image/jpeg' })
}

async function createBitmapCompat(file) {
  // Safari on iOS supports createImageBitmap since 15; fall back to <img>
  // decode() for older devices so we never throw and drop the upload.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // fall through
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}
