// Upload the processed avatar Blob to S3.
//
// Mirrors the attachment flow: ask the server for a presigned PUT, upload the
// Blob straight to S3, and return the key for the caller to associate via the
// PATCH avatar endpoints. The presigner is injected so this stays a pure
// function that unit tests can drive without an HTTP client.

export interface AvatarPresignFile {
  name: string;
  type: string;
  size: number;
}

export type AvatarPresigner = (
  context: "user" | "room",
  file: AvatarPresignFile,
  contextId?: string,
) => Promise<{ presignedUrl: string; s3Key: string }>;

export interface UploadAvatarOptions {
  /** Original filename, passed through as metadata only. */
  filename?: string;
  /** Room id when context === "room". */
  contextId?: string;
}

/**
 * Upload a cropped avatar Blob to S3 via a presigned PUT and return the key.
 *
 * Throws with a user-presentable message on any failure; the caller then
 * associates the returned key with the user/room via updateMyAvatar /
 * updateRoomAvatar.
 */
export async function uploadAvatarBlob(
  presigner: AvatarPresigner,
  context: "user" | "room",
  blob: Blob,
  options: UploadAvatarOptions = {},
): Promise<string> {
  const file = {
    name: options.filename ?? "avatar",
    type: blob.type || "image/png",
    size: blob.size,
  };

  const { presignedUrl, s3Key } = await presigner(
    context,
    file,
    options.contextId,
  );

  const res = await fetch(presignedUrl, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": file.type },
  });
  if (!res.ok) {
    throw new Error(`Avatar upload failed (${res.status})`);
  }

  return s3Key;
}
