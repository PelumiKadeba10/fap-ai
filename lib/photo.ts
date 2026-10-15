export const PHOTO_BUCKET = "batch-photos";
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** File extension for an accepted photo, or null if the type or size isn't allowed. */
export function photoExt(type: string, size: number): string | null {
  if (!(type in EXT) || size <= 0 || size > PHOTO_MAX_BYTES) return null;
  return EXT[type];
}

/** Storage path for a batch's photo: <event_id>/<batch_id>.<ext> */
export const photoPath = (eventId: string, batchId: string, ext: string) => `${eventId}/${batchId}.${ext}`;
