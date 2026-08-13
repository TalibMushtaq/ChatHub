/**
 * Avatar upload constants.
 *
 * These define the upload contract shared by the presign route and the
 * old-avatar cleanup on replace. The frontend mirrors the size/MIME limits
 * for instant feedback, but the server stays authoritative.
 */

/** Maximum original file size a user may upload as an avatar (5 MB). */
export const AVATAR_MAX_SIZE = 5 * 1024 * 1024;

/** Presigned PUT URL expiry in seconds (5 minutes — same as attachments). */
export const AVATAR_PRESIGN_EXPIRY_SECONDS = 300;

/** Presign requests per user per minute. */
export const AVATAR_RATE_LIMIT_MAX = 10;
export const AVATAR_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Allowed avatar MIME types.
 *
 * SVG is deliberately excluded: it can carry scripts and the image is
 * served from a cross-origin proxy, so we never accept it as an avatar.
 */
export const AVATAR_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

/**
 * MIME type → S3 file extension.
 *
 * The extension is always derived from the validated MIME type, never from
 * the client-supplied filename, so a `photo.png` with MIME `image/jpeg`
 * cannot smuggle a `.png` extension into the key.
 */
export const AVATAR_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** S3 key prefix for user-uploaded avatars. */
export const S3_PREFIX_USER_AVATAR = "avatars";

/** S3 key prefix for room-uploaded avatars. */
export const S3_PREFIX_ROOM_AVATAR = "avatars/rooms";
