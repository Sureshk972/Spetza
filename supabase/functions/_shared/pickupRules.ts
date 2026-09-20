// Rules that only apply to pickup-kind requests. Kept out of the edge
// functions so they can be unit-tested without a Supabase client.

export type RequestKind = "send" | "pickup";

// The requester never saw the item, so the courier's photo at pickup is the
// only record of what was handed over. It has to exist before the PIN is
// accepted, or a courier standing at the door skips it every time. The
// path must also sit under this request's own folder: a courier must not
// satisfy the rule by pointing at a photo from another delivery.
export function pickupBlockedReason(
  kind: RequestKind | string | null,
  pickupPhotoPath: string | null,
  requestId: string,
): "photo_required" | null {
  if (kind !== "pickup") return null;
  if (!pickupPhotoPath) return "photo_required";
  if (!pickupPhotoPath.startsWith(`${requestId}/`)) return "photo_required";
  return null;
}
