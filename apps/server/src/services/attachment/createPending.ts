import crypto from "node:crypto";
import { prisma } from "../../../db/prisma";
import { S3Service } from "../S3Service";
import {
  PRESIGN_PUT_EXPIRY_SECONDS,
  MIME_TYPE_EXTENSIONS,
  S3_PREFIX_ROOM,
  S3_PREFIX_DM,
  S3_PREFIX_VOICE,
} from "../../constants/attachment";
import { ApiError } from "../../lib/ApiError";

/**
 * Create a PENDING attachment record and generate a presigned PUT URL.
 *
 * The client uploads directly to S3 using the returned URL. If the client
 * never sends POST /messages, the PENDING attachment becomes an orphan
 * and can be cleaned up later.
 *
 * S3 key format:
 *   attachments/{context}/{contextId}/{uuid}.{ext}
 *
 * Extension is derived from the validated MIME type, never from the
 * original filename.
 */
export async function createPendingAttachment(
  s3Service: S3Service,
  uploaderId: string,
  context: "room" | "dm" | "voice",
  contextId: string,
  filename: string,
  mimeType: string,
  size: number,
) {
  const ext = MIME_TYPE_EXTENSIONS[mimeType];
  if (!ext) {
    throw new ApiError("Unsupported MIME type", 400, "INVALID_MIME_TYPE");
  }

  const uuid = crypto.randomUUID();
  let prefix: string;
  switch (context) {
    case "room":
      prefix = S3_PREFIX_ROOM;
      break;
    case "dm":
      prefix = S3_PREFIX_DM;
      break;
    case "voice":
      prefix = S3_PREFIX_VOICE;
      break;
  }

  const s3Key = `${prefix}/${contextId}/${uuid}.${ext}`;

  // Verify S3 is configured before creating the DB record
  const presignedUrl = await s3Service.generatePresignedPutUrl(
    s3Key,
    mimeType,
    PRESIGN_PUT_EXPIRY_SECONDS,
  );

  const attachment = await prisma.attachment.create({
    data: {
      uploaderId,
      s3Key,
      filename,
      mimeType,
      size,
      status: "PENDING",
    },
    select: {
      id: true,
      s3Key: true,
      filename: true,
      mimeType: true,
      size: true,
      status: true,
      createdAt: true,
    },
  });

  return { attachment, presignedUrl };
}
