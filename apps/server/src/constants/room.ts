/**
 * Chat room runtime constants.
 *
 * Mirrors direct-chat constants so both contexts enforce identical
 * business-logic windows without coupling the two modules.
 */
import { attachmentSummarySelect } from "./attachment";

export const EDIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
export const DELETE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

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
