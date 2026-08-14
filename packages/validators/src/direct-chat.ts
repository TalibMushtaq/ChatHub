import { z } from "zod";

export const MAX_MESSAGE_LENGTH = 30000;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export const startDmSchema = z.object({
  userId: z.string().min(1),
});

export const sendMessageSchema = z
  .object({
    content: z.string().trim().max(MAX_MESSAGE_LENGTH).optional(),
    messageType: z.enum(["TEXT", "IMAGE", "VIDEO", "AUDIO", "VOICE", "FILE"]),
    attachmentIds: z
      .array(z.string().min(1))
      .max(MAX_ATTACHMENTS_PER_MESSAGE)
      .optional(),
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
        "Invalid attachment count for message type. TEXT/SYSTEM require 0, IMAGE/AUDIO/FILE require >=1, VIDEO/VOICE require exactly 1.",
    },
  );

// `z.coerce` converts string query params (e.g. "50") to numbers;
// this is required because Express req.query values are always strings.
export const getMessagesSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  direction: z.enum(["before"]).optional(),
});

export const editMessageSchema = z.object({
  content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

export const messageIdParamSchema = z.object({
  messageId: z.string().min(1),
});

export const directChatIdParamSchema = z.object({
  directChatId: z.string().min(1),
});

// Typing indicator events carry the conversation id plus a boolean so the
// same event shape works for both "start typing" and "stopped typing".
export const directChatTypingSchema = z.object({
  directChatId: z.string().min(1),
  isTyping: z.boolean(),
});

// Query params for the DM inbox endpoint. `z.coerce` converts the string
// query values (Express always sends strings) to the expected types.
export const getInboxQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
