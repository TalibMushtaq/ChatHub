import { z } from "zod";

export const MAX_ROOM_MESSAGE_LENGTH = 2000;

/**
 * Chat room message schema.
 *
 * Validates socket payloads for room chat messages.
 * TEXT requires content; media/file types require attachments.
 * SYSTEM is server-only and rejected from clients.
 */
export const chatRoomMessageSchema = z
  .object({
    chatRoomId: z.string().min(1),
    content: z.string().trim().max(MAX_ROOM_MESSAGE_LENGTH).optional(),
    messageType: z.enum(["TEXT", "IMAGE", "VIDEO", "AUDIO", "VOICE", "FILE"]),
    attachmentIds: z.array(z.string().min(1)).max(10).optional(),
    idempotencyKey: z.string().min(1).max(64).optional(),
  })
  .refine(
    (data) => {
      if (data.messageType === "TEXT") {
        return !!data.content && data.content.trim().length > 0;
      }
      return true;
    },
    {
      message: "TEXT messages require non-empty content.",
      path: ["content"],
    },
  )
  .refine(
    (data) => {
      if (data.messageType === "TEXT") {
        return !data.attachmentIds || data.attachmentIds.length === 0;
      }
      if (
        data.messageType === "IMAGE" ||
        data.messageType === "AUDIO" ||
        data.messageType === "FILE"
      ) {
        return (data.attachmentIds?.length ?? 0) >= 1;
      }
      if (data.messageType === "VIDEO" || data.messageType === "VOICE") {
        return (data.attachmentIds?.length ?? 0) === 1;
      }
      return true;
    },
    {
      message:
        "Invalid attachment count for message type. TEXT requires 0, IMAGE/AUDIO/FILE require >=1, VIDEO/VOICE require exactly 1.",
    },
  );

export const chatRoomEditMessageSchema = z.object({
  chatRoomId: z.string().min(1),
  messageId: z.string().min(1),
  content: z.string().trim().min(1).max(MAX_ROOM_MESSAGE_LENGTH),
});

export const chatRoomDeleteMessageSchema = z.object({
  chatRoomId: z.string().min(1),
  messageId: z.string().min(1),
});
