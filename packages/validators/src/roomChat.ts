import { z } from "zod";

export const MAX_ROOM_MESSAGE_LENGTH = 30000;

/**
 * Chat room message schema.
 *
 * Validates socket payloads for room chat messages.
 * TEXT requires content; media/file types require attachments.
 * SYSTEM is server-only and rejected from clients.
 *
 * Messages are scoped to a Room + Channel: `roomId` proves the sender may act
 * in the room, and `channelId` pins the message into a specific channel. The
 * channel is required for new messages (Phase 1 backfill guarantees every room
 * has at least #general).
 */
export const chatRoomMessageSchema = z
  .object({
    roomId: z.string().min(1),
    // Optional during the channels transition: the server resolves a missing
    // channelId to the room's #general channel (Phase 2 sends it explicitly).
    channelId: z.string().min(1).optional(),
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
  roomId: z.string().min(1),
  messageId: z.string().min(1),
  content: z.string().trim().min(1).max(MAX_ROOM_MESSAGE_LENGTH),
});

export const chatRoomDeleteMessageSchema = z.object({
  roomId: z.string().min(1),
  messageId: z.string().min(1),
});

// Same shape as the DM typing event; room members broadcast to everyone in
// the room except the sender.
export const chatRoomTypingSchema = z.object({
  roomId: z.string().min(1),
  isTyping: z.boolean(),
});
