import { z } from "zod";

/**
 * Avatar upload schemas.
 *
 * Single source of truth for avatar presign validation across the monorepo.
 * The same limits are mirrored client-side (for instant feedback) but the
 * server stays authoritative.
 */

/** Maximum original file size a user may upload as an avatar (5 MB). */
export const AVATAR_MAX_SIZE = 5 * 1024 * 1024;

/** Allowed avatar MIME types — SVG excluded (can carry scripts). */
export const AVATAR_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export const avatarMimeTypeSchema = z.enum([...AVATAR_ALLOWED_MIME_TYPES] as [
  string,
  ...string[],
]);

/**
 * Presign request for an avatar upload.
 *
 * `contextId` is only meaningful (and required) for rooms — for user avatars
 * the S3 key is scoped to the authenticated user's id.
 */
export const avatarPresignSchema = z
  .object({
    context: z.enum(["user", "room"]),
    contextId: z.string().min(1).optional(),
    filename: z.string().min(1).max(255),
    mimeType: avatarMimeTypeSchema,
    size: z.number().int().positive().max(AVATAR_MAX_SIZE),
  })
  .refine(
    (data) => data.context !== "room" || !!data.contextId,
    "contextId is required when context is 'room'",
  );
