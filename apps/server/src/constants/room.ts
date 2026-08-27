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

// Default structure seeded into every new (and migrated) Room.
export const DEFAULT_CATEGORY_NAME = "GENERAL";
export const DEFAULT_CHANNEL_NAME = "general";

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
  channelId: true,
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
  channelId: true,
  messageType: true,
  createdAt: true,
  isDeleted: true,
  editedAt: true,
  metadata: true,
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

/**
 * Channel summary — everything the sidebar + channel management UI needs.
 * Reused by every channel endpoint so payloads stay consistent.
 */
export const channelSummarySelect = {
  id: true,
  roomId: true,
  categoryId: true,
  name: true,
  topic: true,
  type: true,
  position: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Category summary for the sidebar / detail endpoint. */
export const categorySummarySelect = {
  id: true,
  roomId: true,
  name: true,
  position: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Map a Prisma message row (which carries the DB column `chatRoomId`) into the
 * client-facing payload that uses `roomId`. Centralizing the rename keeps every
 * message boundary (history, send ack, socket broadcast) consistent.
 */
export function toRoomMessagePayload<T extends { chatRoomId: string | null }>(
  message: T,
) {
  const { chatRoomId, ...rest } = message;
  return { ...rest, roomId: chatRoomId };
}
