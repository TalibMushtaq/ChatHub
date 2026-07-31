import { z } from "zod";

// --- Reusable primitives ---

export const roomIdSchema = z.string().min(1, "Room ID is required");

export const userIdSchema = z.string().min(1, "User ID is required");

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
