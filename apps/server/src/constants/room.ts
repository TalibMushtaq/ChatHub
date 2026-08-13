/**
 * Chat room runtime constants.
 *
 * Mirrors direct-chat constants so both contexts enforce identical
 * business-logic windows without coupling the two modules.
 */
import { attachmentSummarySelect } from "./attachment";

export const EDIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
export const DELETE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Reusable Prisma select objects
// ---------------------------------------------------------------------------

/**
 * Message payload broadcast over the room socket — used for both freshly
 * created messages and idempotent replays so both paths emit the same shape.
 */
export const messageWithAttachmentsSelect = {
  id: true,
  content: true,
  senderId: true,
  chatRoomId: true,
  messageType: true,
  createdAt: true,
  attachments: { select: attachmentSummarySelect },
} as const;

/**
 * Room message timeline select — mirrors the direct-chat messageWithUserSelect
 * (timeline shape) while staying scoped to chatRoomId. Includes the sender and
 * attachment info the web timeline renders (name, avatar, edited/deleted state).
 */
export const roomMessageWithUserSelect = {
  id: true,
  content: true,
  senderId: true,
  chatRoomId: true,
  messageType: true,
  createdAt: true,
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
