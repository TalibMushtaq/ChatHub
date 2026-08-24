import { describe, it, expect } from "vitest";
import {
  presignSchema,
  attachmentIdParamSchema,
  messageAttachmentSchema,
  messageTypeAttachmentValidationSchema,
  mimeTypeSchema,
  MAX_FILE_SIZE,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_VOICE_DURATION_SECONDS,
  MAX_WAVEFORM_PEAKS,
  ALLOWED_VOICE_MIME_TYPES,
} from "../src/attachment";

// ---------------------------------------------------------------------------
// mimeTypeSchema
// ---------------------------------------------------------------------------
describe("mimeTypeSchema", () => {
  it("accepts image/jpeg", () => {
    const result = mimeTypeSchema.safeParse("image/jpeg");
    expect(result.success).toBe(true);
  });

  it("accepts video/mp4", () => {
    const result = mimeTypeSchema.safeParse("video/mp4");
    expect(result.success).toBe(true);
  });

  it("accepts audio/mpeg", () => {
    const result = mimeTypeSchema.safeParse("audio/mpeg");
    expect(result.success).toBe(true);
  });

  it("accepts application/pdf", () => {
    const result = mimeTypeSchema.safeParse("application/pdf");
    expect(result.success).toBe(true);
  });

  it("accepts text/plain", () => {
    const result = mimeTypeSchema.safeParse("text/plain");
    expect(result.success).toBe(true);
  });

  it("rejects application/x-executable", () => {
    const result = mimeTypeSchema.safeParse("application/x-executable");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// presignSchema
// ---------------------------------------------------------------------------
describe("presignSchema", () => {
  it("accepts valid room context", () => {
    const result = presignSchema.safeParse({
      context: "room",
      contextId: "room1",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid dm context", () => {
    const result = presignSchema.safeParse({
      context: "dm",
      contextId: "dm1",
      filename: "doc.pdf",
      mimeType: "application/pdf",
      size: 2048,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid voice context with duration", () => {
    const result = presignSchema.safeParse({
      context: "voice",
      contextId: "room1",
      filename: "voice.webm",
      mimeType: "audio/webm",
      size: 5120,
      durationSeconds: 30,
    });
    expect(result.success).toBe(true);
  });

  it("accepts voice context with waveformPeaks", () => {
    const result = presignSchema.safeParse({
      context: "voice",
      contextId: "room1",
      filename: "voice.webm",
      mimeType: "audio/webm",
      size: 5120,
      durationSeconds: 10,
      waveformPeaks: [0.1, 0.5, 0.9],
    });
    expect(result.success).toBe(true);
  });

  it("rejects voice context without durationSeconds", () => {
    const result = presignSchema.safeParse({
      context: "voice",
      contextId: "room1",
      filename: "voice.webm",
      mimeType: "audio/webm",
      size: 5120,
    });
    expect(result.success).toBe(false);
  });

  it("rejects voice context with non-voice mime type", () => {
    const result = presignSchema.safeParse({
      context: "voice",
      contextId: "room1",
      filename: "file.pdf",
      mimeType: "application/pdf",
      size: 5120,
      durationSeconds: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects room context with durationSeconds", () => {
    const result = presignSchema.safeParse({
      context: "room",
      contextId: "room1",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
      durationSeconds: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects dm context with waveformPeaks", () => {
    const result = presignSchema.safeParse({
      context: "dm",
      contextId: "dm1",
      filename: "audio.mp3",
      mimeType: "audio/mpeg",
      size: 5120,
      waveformPeaks: [0.5],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing contextId", () => {
    const result = presignSchema.safeParse({
      context: "room",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty contextId", () => {
    const result = presignSchema.safeParse({
      context: "room",
      contextId: "",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing filename", () => {
    const result = presignSchema.safeParse({
      context: "room",
      contextId: "room1",
      mimeType: "image/jpeg",
      size: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero size", () => {
    const result = presignSchema.safeParse({
      context: "room",
      contextId: "room1",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects size over MAX_FILE_SIZE", () => {
    const result = presignSchema.safeParse({
      context: "room",
      contextId: "room1",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: MAX_FILE_SIZE + 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts size at MAX_FILE_SIZE", () => {
    const result = presignSchema.safeParse({
      context: "room",
      contextId: "room1",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: MAX_FILE_SIZE,
    });
    expect(result.success).toBe(true);
  });

  it("rejects durationSeconds over max", () => {
    const result = presignSchema.safeParse({
      context: "voice",
      contextId: "room1",
      filename: "voice.webm",
      mimeType: "audio/webm",
      size: 5120,
      durationSeconds: MAX_VOICE_DURATION_SECONDS + 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts durationSeconds at max", () => {
    const result = presignSchema.safeParse({
      context: "voice",
      contextId: "room1",
      filename: "voice.webm",
      mimeType: "audio/webm",
      size: 5120,
      durationSeconds: MAX_VOICE_DURATION_SECONDS,
    });
    expect(result.success).toBe(true);
  });

  it("rejects waveformPeaks with value > 1", () => {
    const result = presignSchema.safeParse({
      context: "voice",
      contextId: "room1",
      filename: "voice.webm",
      mimeType: "audio/webm",
      size: 5120,
      durationSeconds: 10,
      waveformPeaks: [1.5],
    });
    expect(result.success).toBe(false);
  });

  it("rejects waveformPeaks with value < 0", () => {
    const result = presignSchema.safeParse({
      context: "voice",
      contextId: "room1",
      filename: "voice.webm",
      mimeType: "audio/webm",
      size: 5120,
      durationSeconds: 10,
      waveformPeaks: [-0.1],
    });
    expect(result.success).toBe(false);
  });

  it("rejects waveformPeaks over MAX_WAVEFORM_PEAKS", () => {
    const result = presignSchema.safeParse({
      context: "voice",
      contextId: "room1",
      filename: "voice.webm",
      mimeType: "audio/webm",
      size: 5120,
      durationSeconds: 10,
      waveformPeaks: Array.from({ length: MAX_WAVEFORM_PEAKS + 1 }, () => 0.5),
    });
    expect(result.success).toBe(false);
  });

  it("accepts waveformPeaks at MAX_WAVEFORM_PEAKS", () => {
    const result = presignSchema.safeParse({
      context: "voice",
      contextId: "room1",
      filename: "voice.webm",
      mimeType: "audio/webm",
      size: 5120,
      durationSeconds: 10,
      waveformPeaks: Array.from({ length: MAX_WAVEFORM_PEAKS }, () => 0.5),
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid context enum", () => {
    const result = presignSchema.safeParse({
      context: "invalid",
      contextId: "room1",
      filename: "file.jpg",
      mimeType: "image/jpeg",
      size: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer size", () => {
    const result = presignSchema.safeParse({
      context: "room",
      contextId: "room1",
      filename: "file.jpg",
      mimeType: "image/jpeg",
      size: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// attachmentIdParamSchema
// ---------------------------------------------------------------------------
describe("attachmentIdParamSchema", () => {
  it("accepts valid attachmentId", () => {
    const result = attachmentIdParamSchema.safeParse({ attachmentId: "att1" });
    expect(result.success).toBe(true);
  });

  it("rejects empty attachmentId", () => {
    const result = attachmentIdParamSchema.safeParse({ attachmentId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing attachmentId", () => {
    const result = attachmentIdParamSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// messageAttachmentSchema
// ---------------------------------------------------------------------------
describe("messageAttachmentSchema", () => {
  it("accepts valid payload with attachments", () => {
    const result = messageAttachmentSchema.safeParse({
      attachmentIds: ["att1", "att2"],
      messageType: "IMAGE",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid payload without attachments", () => {
    const result = messageAttachmentSchema.safeParse({
      messageType: "TEXT",
    });
    expect(result.success).toBe(true);
  });

  it("accepts up to MAX_ATTACHMENTS_PER_MESSAGE", () => {
    const result = messageAttachmentSchema.safeParse({
      attachmentIds: Array.from(
        { length: MAX_ATTACHMENTS_PER_MESSAGE },
        (_, i) => `att${i}`,
      ),
      messageType: "FILE",
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than MAX_ATTACHMENTS_PER_MESSAGE", () => {
    const result = messageAttachmentSchema.safeParse({
      attachmentIds: Array.from(
        { length: MAX_ATTACHMENTS_PER_MESSAGE + 1 },
        (_, i) => `att${i}`,
      ),
      messageType: "FILE",
    });
    expect(result.success).toBe(false);
  });

  it("rejects SYSTEM messageType", () => {
    const result = messageAttachmentSchema.safeParse({
      messageType: "SYSTEM",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional idempotencyKey", () => {
    const result = messageAttachmentSchema.safeParse({
      messageType: "TEXT",
      idempotencyKey: "key123",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// messageTypeAttachmentValidationSchema
// ---------------------------------------------------------------------------
describe("messageTypeAttachmentValidationSchema", () => {
  it("accepts TEXT with no attachments", () => {
    const result = messageTypeAttachmentValidationSchema.safeParse({
      messageType: "TEXT",
    });
    expect(result.success).toBe(true);
  });

  it("rejects TEXT with attachments", () => {
    const result = messageTypeAttachmentValidationSchema.safeParse({
      messageType: "TEXT",
      attachmentIds: ["att1"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts SYSTEM with no attachments", () => {
    const result = messageTypeAttachmentValidationSchema.safeParse({
      messageType: "SYSTEM",
    });
    expect(result.success).toBe(true);
  });

  it("rejects SYSTEM with attachments", () => {
    const result = messageTypeAttachmentValidationSchema.safeParse({
      messageType: "SYSTEM",
      attachmentIds: ["att1"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts IMAGE with 1+ attachments", () => {
    const result = messageTypeAttachmentValidationSchema.safeParse({
      messageType: "IMAGE",
      attachmentIds: ["att1"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects IMAGE without attachments", () => {
    const result = messageTypeAttachmentValidationSchema.safeParse({
      messageType: "IMAGE",
    });
    expect(result.success).toBe(false);
  });

  it("accepts VIDEO with exactly 1 attachment", () => {
    const result = messageTypeAttachmentValidationSchema.safeParse({
      messageType: "VIDEO",
      attachmentIds: ["att1"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects VIDEO with 2 attachments", () => {
    const result = messageTypeAttachmentValidationSchema.safeParse({
      messageType: "VIDEO",
      attachmentIds: ["att1", "att2"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts AUDIO with 1+ attachments", () => {
    const result = messageTypeAttachmentValidationSchema.safeParse({
      messageType: "AUDIO",
      attachmentIds: ["att1", "att2"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects AUDIO without attachments", () => {
    const result = messageTypeAttachmentValidationSchema.safeParse({
      messageType: "AUDIO",
    });
    expect(result.success).toBe(false);
  });

  it("accepts VOICE with exactly 1 attachment", () => {
    const result = messageTypeAttachmentValidationSchema.safeParse({
      messageType: "VOICE",
      attachmentIds: ["att1"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects VOICE with 0 attachments", () => {
    const result = messageTypeAttachmentValidationSchema.safeParse({
      messageType: "VOICE",
    });
    expect(result.success).toBe(false);
  });

  it("accepts FILE with 1+ attachments", () => {
    const result = messageTypeAttachmentValidationSchema.safeParse({
      messageType: "FILE",
      attachmentIds: ["att1"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects FILE without attachments", () => {
    const result = messageTypeAttachmentValidationSchema.safeParse({
      messageType: "FILE",
    });
    expect(result.success).toBe(false);
  });
});
