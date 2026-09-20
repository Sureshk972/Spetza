// Upload one photo to the private delivery-proof bucket under
// `<delivery_request_id>/<uuid>.<ext>` -- storage RLS and the edge functions
// both key off that first path segment. Used for the drop-off proof and,
// on pickup-kind requests, the item photo at collection.
import { supabase } from './supabase.js'
import { resizeImage } from './resizeImage.js'
import { uniqueId, isImageFile, imageExt } from './uploadName.js'

export const PROOF_BUCKET = 'delivery-proof'
export const MAX_PROOF_BYTES = 15 * 1024 * 1024

// Resolves the object path. Throws an Error with a message fit for a toast.
export async function uploadProofPhoto(deliveryRequestId, file) {
  if (!isImageFile(file)) throw new Error('Pick an image file.')
  if (file.size > MAX_PROOF_BYTES) throw new Error('Image must be under 15 MB.')
  let uploadFile = file
  try {
    uploadFile = await resizeImage(file)
  } catch {
    // Resize failed — upload the original rather than block a courier
    // who is standing on a doorstep.
  }
  const objectPath = `${deliveryRequestId}/${uniqueId()}.${imageExt(uploadFile)}`
  const { error } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(objectPath, uploadFile, { contentType: uploadFile.type || 'image/jpeg' })
  if (error) {
    console.error('proof upload failed', error)
    throw new Error("Couldn't upload that photo. Check your signal and try again.")
  }
  return objectPath
}
