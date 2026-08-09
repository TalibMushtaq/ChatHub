import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";

/**
 * Mark a chat room as read for the given user.
 *
 * Same transactional pattern as markDirectChatRead: validate, compare,
 * upsert, count — all inside a single Prisma transaction.
 *
 * Returns the updated receipt and the computed unread count.
 */
export async function markRoomRead(
  userId: string,
  chatRoomId: string,
  lastReadMessageId: string,
) {
  const result = await prisma.$transaction(async (tx) => {
    // 1. Verify the message exists and belongs to this room.
    const message = await tx.message.findUnique({
      where: { id: lastReadMessageId },
      select: { id: true, chatRoomId: true, createdAt: true },
    });

    if (!message) {
      throw new ApiError("Message not found", 404, "MESSAGE_NOT_FOUND");
    }

    if (message.chatRoomId !== chatRoomId) {
      throw new ApiError(
        "Message does not belong to this room",
        400,
        "MESSAGE_WRONG_ROOM",
      );
    }

    // 2. Fetch the existing receipt (if any).
    const existing = await tx.chatRoomReadReceipt.findUnique({
      where: { userId_chatRoomId: { userId, chatRoomId } },
      select: { lastReadMessageCreatedAt: true },
    });

    // 3. Only update if the incoming cursor is strictly newer.
    if (
      existing?.lastReadMessageCreatedAt &&
      existing.lastReadMessageCreatedAt >= message.createdAt
    ) {
      const unreadCount = await tx.message.count({
        where: {
          chatRoomId,
          senderId: { not: userId },
          isDeleted: false,
          createdAt: { gt: existing.lastReadMessageCreatedAt },
        },
      });
      return { unreadCount, cursorAdvanced: false };
    }

    // 4. Upsert the receipt with the new cursor.
    await tx.chatRoomReadReceipt.upsert({
      where: { userId_chatRoomId: { userId, chatRoomId } },
      create: {
        userId,
        chatRoomId,
        lastReadMessageId,
        lastReadMessageCreatedAt: message.createdAt,
      },
      update: {
        lastReadMessageId,
        lastReadMessageCreatedAt: message.createdAt,
      },
    });

    // 5. Compute unread count after advancing the cursor.
    const unreadCount = await tx.message.count({
      where: {
        chatRoomId,
        senderId: { not: userId },
        isDeleted: false,
        createdAt: { gt: message.createdAt },
      },
    });

    return { unreadCount, cursorAdvanced: true };
  });

  return {
    lastReadMessageId,
    unreadCount: result.unreadCount,
  };
}
