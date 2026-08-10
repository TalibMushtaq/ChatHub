/**
 * Attachment runtime constants.
 *
 * All business-logic tunables live here so routes/services don't repeat magic numbers.
 */

/** Maximum file size in bytes (100MB). */
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

/** Maximum number of attachments per message. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

/** Presigned PUT URL expiry in seconds (5 minutes). */
export const PRESIGN_PUT_EXPIRY_SECONDS = 300;

/** Presigned GET URL expiry in seconds (5 minutes). */
export const PRESIGN_GET_EXPIRY_SECONDS = 300;

/** S3 key prefix for room attachments. */
export const S3_PREFIX_ROOM = "attachments/room";

/** S3 key prefix for DM attachments. */
export const S3_PREFIX_DM = "attachments/dm";

/** S3 key prefix for voice recordings. */
export const S3_PREFIX_VOICE = "attachments/voice";

/** S3 key prefix for thumbnails. */
export const S3_PREFIX_THUMBNAIL = "attachments/thumbnails";

/** S3 key prefix for avatars. */
export const S3_PREFIX_AVATAR = "attachments/avatars";

/** Idempotency key TTL in seconds (24 hours). */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/** Allowed MIME type to file extension mapping. */
export const MIME_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogv",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/flac": "flac",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/json": "json",
  "text/plain": "txt",
  "text/markdown": "md",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

/** Allowed MIME types for images. */
export const IMAGE_MIME_TYPES = Object.keys(MIME_TYPE_EXTENSIONS).filter((m) =>
  m.startsWith("image/"),
);

/** Allowed MIME types for videos. */
export const VIDEO_MIME_TYPES = Object.keys(MIME_TYPE_EXTENSIONS).filter((m) =>
  m.startsWith("video/"),
);

/** Allowed MIME types for audio (including voice). */
export const AUDIO_MIME_TYPES = Object.keys(MIME_TYPE_EXTENSIONS).filter((m) =>
  m.startsWith("audio/"),
);

// ---------------------------------------------------------------------------
// Reusable Prisma select objects
// ---------------------------------------------------------------------------

/**
 * Attachment fields returned alongside a message.
 *
 * Shared by every message payload (rooms, DMs, idempotent replays) so clients
 * always receive the same attachment shape.
 */
// `as const` narrows the inferred type to literal booleans, which lets Prisma
// infer the exact shape of the returned object.
export const attachmentSummarySelect = {
  id: true,
  filename: true,
  mimeType: true,
  size: true,
  width: true,
  height: true,
  thumbnailKey: true,
} as const;
