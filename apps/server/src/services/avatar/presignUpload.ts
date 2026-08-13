import crypto from "node:crypto";
import { S3Service } from "../S3Service";
import {
  AVATAR_MIME_EXTENSIONS,
  AVATAR_PRESIGN_EXPIRY_SECONDS,
  S3_PREFIX_USER_AVATAR,
  S3_PREFIX_ROOM_AVATAR,
} from "../../constants/avatar";
import { ApiError } from "../../lib/ApiError";

/**
 * Generate a presigned PUT URL for a direct avatar upload.
 *
 * The client uploads the cropped/processed image straight to S3, then
 * associates the returned key via the existing PATCH avatar endpoints.
 * This service never touches the database — `User.avatar`/`ChatRoom.avatar`
 * remain the authority for what avatar is currently selected.
 *
 * S3 key format:
 *   user: avatars/{userId}/{uuid}.{ext}
 *   room: avatars/rooms/{roomId}/{uuid}.{ext}
 *
 * The extension is derived from the validated MIME type, never from the
 * client-supplied filename (a filename can lie; the MIME type is checked
 * against the allowlist).
 */
export async function presignAvatarUpload(
  s3Service: S3Service,
  ownerId: string,
  context: "user" | "room",
  contextId: string | undefined,
  mimeType: string,
) {
  const ext = AVATAR_MIME_EXTENSIONS[mimeType];
  if (!ext) {
    throw new ApiError("Unsupported image type", 400, "INVALID_AVATAR_MIME");
  }

  const uuid = crypto.randomUUID();
  const scopedId = context === "room" ? (contextId ?? ownerId) : ownerId;
  const prefix =
    context === "room" ? S3_PREFIX_ROOM_AVATAR : S3_PREFIX_USER_AVATAR;
  const s3Key = `${prefix}/${scopedId}/${uuid}.${ext}`;

  const presignedUrl = await s3Service.generatePresignedPutUrl(
    s3Key,
    mimeType,
    AVATAR_PRESIGN_EXPIRY_SECONDS,
  );

  return { s3Key, presignedUrl };
}
