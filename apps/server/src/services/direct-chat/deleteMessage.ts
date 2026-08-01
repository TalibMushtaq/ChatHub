import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";
import { DELETE_WINDOW_MS } from "../../constants/direct-chat";

/**
 * Soft-delete a direct-chat message within the delete window.
 *
 * Authorization checks:
 * - Message must exist
 * - Only the original sender may delete
 * - Already-deleted messages are rejected with 400
 * - Deletes are rejected after DELETE_WINDOW_MS
 *
 * Returns the deleted message stub with id, directChatId, deletedAt.
 */
export async function deleteMessage(userId: string, messageId: string) {
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      senderId: true,
      directChatId: true,
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
    throw new ApiError("Alreadt deleted", 400, "ALREADY_DELETED");
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
      directChatId: true,
      deletedAt: true,
    },
  });

  return deleted;
}
