import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";

/**
 * Mark a direct chat as read for the given user.
 *
 * All validation, comparison, and update happen inside a single
 * Prisma transaction to avoid race conditions between concurrent requests.
 *
 * Returns the updated receipt and the computed unread count.
 */
export async function markDirectChatRead(
  userId: string,
  directChatId: string,
  lastReadMessageId: string,
) {
  const result = await prisma.$transaction(async (tx) => {
    // 1. Verify the message exists and belongs to this conversation.
    const message = await tx.message.findUnique({
      where: { id: lastReadMessageId },
      select: { id: true, directChatId: true, createdAt: true },
    });

    if (!message) {
      throw new ApiError("Message not found", 404, "MESSAGE_NOT_FOUND");
    }

    if (message.directChatId !== directChatId) {
      throw new ApiError(
        "Message does not belong to this conversation",
        400,
        "MESSAGE_WRONG_CHAT",
      );
    }

    // 2. Fetch the existing receipt (if any).
    const existing = await tx.directChatReadReceipt.findUnique({
      where: { userId_directChatId: { userId, directChatId } },
      select: { lastReadMessageCreatedAt: true },
    });

    // 3. Only update if the incoming cursor is strictly newer.
    if (
      existing?.lastReadMessageCreatedAt &&
      existing.lastReadMessageCreatedAt >= message.createdAt
    ) {
      // Cursor is not moving forward — skip update, still compute count.
      const unreadCount = await tx.message.count({
        where: {
          directChatId,
          senderId: { not: userId },
          createdAt: { gt: existing.lastReadMessageCreatedAt },
        },
      });
      return { unreadCount, cursorAdvanced: false };
    }

    // 4. Upsert the receipt with the new cursor.
    await tx.directChatReadReceipt.upsert({
      where: { userId_directChatId: { userId, directChatId } },
      create: {
        userId,
        directChatId,
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
        directChatId,
        senderId: { not: userId },
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
