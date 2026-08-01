import { z } from "zod";

export const MAX_MESSAGE_LENGTH = 5000;

export const startDmSchema = z.object({
  userId: z.string().min(1),
});

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

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
