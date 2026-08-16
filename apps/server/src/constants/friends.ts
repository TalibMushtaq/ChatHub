/**
 * Friend-system runtime constants.
 *
 * Mirrors constants/direct-chat.ts: all business-logic tunables and shared
 * Prisma selects live here so routes/services never repeat magic numbers and
 * every response shape stays identical across endpoints.
 */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

/** Summary fields included with every user that appears in friend payloads. */
export const friendUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
} as const;

/**
 * Full FriendRequest row with both participants.
 *
 * `as const` narrows the inferred type to literal booleans, letting Prisma
 * infer the exact response shape (same pattern as messageWithUserSelect).
 */
export const friendRequestSelect = {
  id: true,
  senderId: true,
  recipientId: true,
  status: true,
  createdAt: true,
  sender: { select: friendUserSelect },
  recipient: { select: friendUserSelect },
} as const;
