import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";
import { DELETE_WINDOW_MS } from "../../constants/room";

/**
 * Soft-delete a room message within the delete window.
 *
 * Authorization checks:
 * - Message must exist and belong to `chatRoomId`
 * - Only the original sender may delete
 * - Already-deleted messages are rejected with 400
 * - Deletes are rejected after DELETE_WINDOW_MS
 *
 * Scoping the lookup to `chatRoomId` is what makes the caller's room-level
 * authorization meaningful: without it, a member of any room could delete one
 * of their own messages from a different room or direct chat.
 *
 * Returns the deleted message stub with id, chatRoomId, deletedAt.
 */
export async function deleteMessage(
  userId: string,
  chatRoomId: string,
  messageId: string,
) {
  const msg = await prisma.message.findFirst({
    where: { id: messageId, chatRoomId },
    select: {
      id: true,
      senderId: true,
      chatRoomId: true,
      isDeleted: true,
      createdAt: true,
    },
  });

  if (!msg) {
    throw new ApiError("Message not found", 404, "MESSAGE_NOT_FOUND");
  }

  if (msg.senderId !== userId) {
    throw new ApiError("Not allowed", 403, "FORBIDDEN");
  }

  if (msg.isDeleted) {
    throw new ApiError("Already deleted", 400, "ALREADY_DELETED");
  }

  if (Date.now() - new Date(msg.createdAt).getTime() > DELETE_WINDOW_MS) {
    throw new ApiError("Delete window expired", 403, "DELETE_WINDOW_EXPIRED");
  }

  // Null out content to reclaim storage and prevent leaking text after
  // soft-delete; the UI relies on isDeleted / deletedAt to render a marker.
  const deleted = await prisma.message.update({
    where: { id: messageId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      content: null,
    },
    select: {
      id: true,
      chatRoomId: true,
      deletedAt: true,
    },
  });

  return deleted;
}
