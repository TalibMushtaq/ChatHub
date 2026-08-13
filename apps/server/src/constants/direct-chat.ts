/**
 * Direct-chat runtime constants.
 *
 * All business-logic tunables live here so routes/services don't repeat magic numbers.
 */
import { attachmentSummarySelect } from "./attachment";

export const MAX_MESSAGE_LENGTH = 5000;
export const EDIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
export const DELETE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Reusable Prisma select objects (keeps route/service selects DRY and exact)
// ---------------------------------------------------------------------------

/** Used when creating a message — matches the original send-message response. */
// `as const` narrows the inferred type to literal booleans, which lets Prisma
// infer the exact shape of the returned object — no manual type annotations needed.
export const messageCreateSelect = {
  id: true,
  content: true,
  senderId: true,
  directChatId: true,
  createdAt: true,
} as const;

/** Used when fetching the message timeline — matches the original get-messages response. */
// Reused across getMessages so every endpoint returns identical fields;
// this prevents drift when the schema evolves.
export const messageWithUserSelect = {
  id: true,
  content: true,
  createdAt: true,
  messageType: true,
  isDeleted: true,
  editedAt: true,
  User: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatar: true,
    },
  },
  attachments: { select: attachmentSummarySelect },
} as const;

/** Message payload including its attachments — shared by send and replay paths. */
export const messageWithAttachmentsSelect = {
  ...messageCreateSelect,
  attachments: { select: attachmentSummarySelect },
} as const;

/** Used when returning a newly created chat — matches the original start-dm response. */
// Shared between create and fallback-fetch so the start-dm response shape
// is identical whether the chat is new or already existed.
export const chatSelect = {
  id: true,
  user1Id: true,
  user2Id: true,
  createdAt: true,
} as const;
