import crypto from "node:crypto";
import { prisma } from "../../../db/prisma";
import { S3Service } from "../S3Service";
import {
  PRESIGN_PUT_EXPIRY_SECONDS,
  MIME_TYPE_EXTENSIONS,
  S3_PREFIX_ROOM,
  S3_PREFIX_DM,
  S3_PREFIX_VOICE,
  MAX_VOICE_DURATION_SECONDS,
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
 *
 * Voice recordings additionally persist their duration (seconds) and the
 * precomputed waveform samples the recorder captured, so playback can render
 * the waveform without decoding the file. The duration cap is enforced here
 * too (not just at the validator) because this is the last place the raw
 * request fields are trusted before they become DB rows.
 */
export async function createPendingAttachment(
  s3Service: S3Service,
  uploaderId: string,
  context: "room" | "dm" | "voice",
  contextId: string,
  filename: string,
  mimeType: string,
  size: number,
  voice?: { durationSeconds: number; waveformPeaks?: number[] },
) {
  const ext = MIME_TYPE_EXTENSIONS[mimeType];
  if (!ext) {
    throw new ApiError("Unsupported MIME type", 400, "INVALID_MIME_TYPE");
  }

  if (context === "voice") {
    if (voice?.durationSeconds == null) {
      throw new ApiError(
        "Voice recordings require a duration",
        400,
        "VOICE_DURATION_REQUIRED",
      );
    }
    if (voice.durationSeconds > MAX_VOICE_DURATION_SECONDS) {
      throw new ApiError(
        `Voice recordings cannot exceed ${MAX_VOICE_DURATION_SECONDS} seconds`,
        400,
        "VOICE_DURATION_TOO_LONG",
      );
    }
    // The DB column is an integer, so a float from a non-web client is
    // normalized here rather than rejected — the presign validator already
    // guarantees whole seconds for our web client.
    voice = { ...voice, durationSeconds: Math.round(voice.durationSeconds) };
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
      duration: voice?.durationSeconds ?? null,
      waveformPeaks: voice?.waveformPeaks ?? undefined,
      status: "PENDING",
    },
    select: {
      id: true,
      s3Key: true,
      filename: true,
      mimeType: true,
      size: true,
      duration: true,
      waveformPeaks: true,
      status: true,
      createdAt: true,
    },
  });

  return { attachment, presignedUrl };
}
