import { z } from "zod";

// --- Reusable primitives ---

export const roomIdSchema = z.string().min(1, "Room ID is required");

export const userIdSchema = z.string().min(1, "User ID is required");

/** Accepted avatar keys for rooms: a shared default or a room-specific upload. */
export const roomAvatarKeySchema = z.union([
  z
    .string()
    .regex(/^defaults\/room\/[^/]+\.png$/, "Invalid default room avatar"),
  z
    .string()
    .regex(/^avatars\/rooms\/[^/]+\/.+/, "Invalid room avatar key format"),
]);

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

export const updateRoomSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be at most 100 characters")
    .optional(),
  description: z
    .string()
    .trim()
    .max(500, "Description must be at most 500 characters")
    .optional()
    .nullable(),
  avatarKey: roomAvatarKeySchema.optional().nullable(),
});

// --- Categories ---

export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Category name is required")
    .max(100, "Category name must be at most 100 characters"),
});

export const updateCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Category name is required")
    .max(100, "Category name must be at most 100 characters")
    .optional(),
  position: z.number().int().min(0, "Position must be non-negative").optional(),
});

// --- Channels ---

/**
 * Channel names are normalized to Discord-style lowercase-hyphen form:
 * spaces/underscores collapse into single hyphens and surrounding punctuation
 * is trimmed. The normalized form must be 2–32 chars of [a-z0-9-].
 */
export const normalizeChannelName = (name: string) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

export const channelNameSchema = z
  .string()
  .min(2, "Channel name must be at least 2 characters")
  .max(32, "Channel name must be at most 32 characters")
  .transform(normalizeChannelName)
  .refine((name) => /^[a-z0-9][a-z0-9-]*$/.test(name), {
    message:
      "Channel names may only contain lowercase letters, numbers, and hyphens",
  });

/** VOICE is accepted now but only wired up end-to-end in the calling phase. */
export const channelTypeSchema = z.enum(["TEXT", "VOICE"]);

export const createChannelSchema = z.object({
  name: channelNameSchema,
  type: channelTypeSchema.default("TEXT"),
  topic: z
    .string()
    .trim()
    .max(200, "Topic must be at most 200 characters")
    .optional()
    .nullable(),
  categoryId: z.string().min(1).optional().nullable(),
});

export const updateChannelSchema = z.object({
  name: channelNameSchema.optional(),
  topic: z
    .string()
    .trim()
    .max(200, "Topic must be at most 200 characters")
    .optional()
    .nullable(),
  categoryId: z.string().min(1).optional().nullable(),
  position: z.number().int().min(0, "Position must be non-negative").optional(),
});

// --- Reordering ---

/** Ordered list of category/channel ids used by the `.../reorder` endpoints. */
export const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1, "Ordered ids are required"),
});

/**
 * Channel reorder payload: each channel carries the category it ends up in so a
 * drag across categories (move + reorder) commits atomically in one request.
 * `categoryId: null` moves the channel to "Uncategorized".
 */
export const channelReorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        categoryId: z.string().min(1).nullable(),
      }),
    )
    .min(1, "Ordered channels are required"),
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

export const roomIdParamSchema = z.object({
  roomId: z.string().min(1),
});

export const categoryIdParamSchema = z.object({
  categoryId: z.string().min(1),
});

export const channelIdParamSchema = z.object({
  channelId: z.string().min(1),
});

export const markReadSchema = z.object({
  lastReadMessageId: z.string().min(1),
});
