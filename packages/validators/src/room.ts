import { z } from "zod";

// --- Reusable primitives ---

export const roomIdSchema = z.string().min(1, "Room ID is required");

export const userIdSchema = z.string().min(1, "User ID is required");

// --- Rooms ---

export const createRoomSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be at most 100 characters"),
  description: z
    .string()
    .trim()
    .max(500, "Description must be at most 500 characters")
    .optional()
    .nullable(),
  avatarKey: z
    .string()
    .regex(/^defaults\/room\/[^/]+\.png$/, "Invalid default room avatar")
    .optional()
    .nullable(),
});

// --- Invitations ---

export const sendInvitationSchema = z.object({
  targetUserId: userIdSchema,
});

export const respondInvitationSchema = z.object({
  status: z.enum(["ACCEPTED", "REJECTED"], {
    message: "Status must be ACCEPTED or REJECTED",
  }),
});

// --- Join Requests ---

export const joinRequestActionSchema = z.object({
  action: z.enum(["APPROVED", "REJECTED"], {
    message: "Action must be APPROVED or REJECTED",
  }),
});

// --- Join Links ---

export const createJoinLinkSchema = z.object({
  maxUses: z
    .number()
    .int()
    .positive("maxUses must be a positive integer")
    .optional(),
  expiresAt: z
    .string()
    .datetime("expiresAt must be a valid ISO datetime")
    .optional(),
});

// --- Query params ---

export const joinRequestStatusQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});

// --- Read receipts ---

export const chatRoomIdParamSchema = z.object({
  chatRoomId: z.string().min(1),
});

export const markReadSchema = z.object({
  lastReadMessageId: z.string().min(1),
});
