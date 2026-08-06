import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";
import { EDIT_WINDOW_MS } from "../../constants/room";

/**
 * Edit a room message within the edit window.
 *
 * Authorization checks:
 * - Message must exist and not be soft-deleted
 * - Only the original sender may edit
 * - Edits are rejected after EDIT_WINDOW_MS
 *
 * Returns the updated message with id, content, editedAt, chatRoomId.
 */
export async function editMessage(
  userId: string,
  messageId: string,
  content: string,
) {
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      senderId: true,
      chatRoomId: true,
      isDeleted: true,
      createdAt: true,
    },
  });

  if (!msg || msg.isDeleted) {
    throw new ApiError(
      "message not found or already deleted",
      404,
      "MESSAGE_NOT_FOUND",
    );
  }

  if (msg.senderId !== userId) {
    throw new ApiError("not allowed", 403, "FORBIDDEN");
  }

  if (Date.now() - new Date(msg.createdAt).getTime() > EDIT_WINDOW_MS) {
    throw new ApiError("Edit window expired", 403, "EDIT_WINDOW_EXPIRED");
  }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { content, editedAt: new Date() },
    select: {
      id: true,
      content: true,
      editedAt: true,
      chatRoomId: true,
    },
  });

  return updated;
}
