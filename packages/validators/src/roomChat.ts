import { z } from "zod";

/**
 * Chat room message schema.
 *
 * Why: For TEXT messages, content is required and capped at 2000 chars.
 * For FILE messages, content is optional (file metadata is separate).
 * Prisma can't enforce conditional constraints, so we handle it in Zod.
 */
export const chatRoomMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("TEXT"),
    chatRoomId: z.string().min(1),
    content: z.string().trim().min(1).max(2000),
  }),
  z.object({
    type: z.literal("FILE"),
    chatRoomId: z.string().min(1),
    content: z.string().trim().max(2000).optional(),
    fileUrl: z.string().url(),
    fileName: z.string().min(1).max(255),
    fileSize: z.number().int().positive().max(100 * 1024 * 1024), // 100MB
  }),
]);
