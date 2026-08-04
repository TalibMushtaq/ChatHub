import { z } from "zod";

/**
 * Attachment schemas.
 *
 * Single source of truth for attachment validation across the monorepo.
 */

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
] as const;

export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
] as const;

export const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/flac",
] as const;

export const ALLOWED_VOICE_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
] as const;

export const ALLOWED_FILE_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_VIDEO_MIME_TYPES,
  ...ALLOWED_AUDIO_MIME_TYPES,
  "application/pdf",
  "application/zip",
  "application/json",
  "text/plain",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const ALL_ALLOWED_MIME_TYPES = [
  ...new Set([
    ...ALLOWED_IMAGE_MIME_TYPES,
    ...ALLOWED_VIDEO_MIME_TYPES,
    ...ALLOWED_AUDIO_MIME_TYPES,
    ...ALLOWED_VOICE_MIME_TYPES,
    ...ALLOWED_FILE_MIME_TYPES,
  ]),
] as const;

export const mimeTypeSchema = z.enum(ALL_ALLOWED_MIME_TYPES as [string, ...string[]]);

export const presignSchema = z.object({
  context: z.enum(["room", "dm", "voice"]),
  contextId: z.string().min(1, "Context ID is required"),
  filename: z.string().min(1).max(255),
  mimeType: mimeTypeSchema,
  size: z.number().int().positive().max(MAX_FILE_SIZE),
});

export const attachmentIdParamSchema = z.object({
  attachmentId: z.string().min(1),
});

export const messageAttachmentSchema = z.object({
  attachmentIds: z
    .array(z.string().min(1))
    .max(MAX_ATTACHMENTS_PER_MESSAGE)
    .optional(),
  messageType: z.enum([
    "TEXT",
    "IMAGE",
    "VIDEO",
    "AUDIO",
    "VOICE",
    "FILE",
    "SYSTEM",
  ]),
  idempotencyKey: z.string().min(1).max(64).optional(),
});

export const messageTypeAttachmentValidationSchema = z
  .object({
    messageType: z.enum([
      "TEXT",
      "IMAGE",
      "VIDEO",
      "AUDIO",
      "VOICE",
      "FILE",
      "SYSTEM",
    ]),
    attachmentIds: z.array(z.string().min(1)).optional(),
  })
  .refine(
    (data) => {
      if (data.messageType === "TEXT") {
        return !data.attachmentIds || data.attachmentIds.length === 0;
      }
      if (data.messageType === "SYSTEM") {
        return !data.attachmentIds || data.attachmentIds.length === 0;
      }
      if (data.messageType === "IMAGE") {
        return (data.attachmentIds?.length ?? 0) >= 1;
      }
      if (data.messageType === "VIDEO") {
        return (data.attachmentIds?.length ?? 0) === 1;
      }
      if (data.messageType === "AUDIO") {
        return (data.attachmentIds?.length ?? 0) >= 1;
      }
      if (data.messageType === "VOICE") {
        return (data.attachmentIds?.length ?? 0) === 1;
      }
      if (data.messageType === "FILE") {
        return (data.attachmentIds?.length ?? 0) >= 1;
      }
      return true;
    },
    {
      message:
        "Invalid attachment count for message type. TEXT/SYSTEM require 0, IMAGE/AUDIO/FILE require >=1, VIDEO/VOICE require exactly 1.",
    },
  );
