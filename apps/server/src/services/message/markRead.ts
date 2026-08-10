import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";
import type { MessageScopeField } from "./mutations";

/**
 * Minimal shape of a read-receipt delegate (chatRoomReadReceipt /
 * directChatReadReceipt). Both models share the same cursor columns and only
 * differ in their compound unique key, which the caller supplies.
 */
interface ReadReceiptDelegate {
  findUnique(args: {
    where: object;
    select: { lastReadMessageCreatedAt: true };
  }): Promise<{ lastReadMessageCreatedAt: Date | null } | null>;
  upsert(args: {
    where: object;
    create: object;
    update: object;
  }): Promise<unknown>;
}

interface MarkReadOptions {
  /** Column linking a message to its conversation. */
  scopeField: MessageScopeField;
  /** Id of the conversation being marked as read. */
  scopeId: string;
  /** Receipt model holding the read cursor for this conversation type. */
  receiptModel: "chatRoomReadReceipt" | "directChatReadReceipt";
  /** Compound unique key identifying this user's receipt. */
  receiptWhere: object;
  /** Error reported when the message belongs to a different conversation. */
  wrongScope: { message: string; code: string };
}

/**
 * Mark a conversation as read for the given user.
 *
 * All validation, comparison, and update happen inside a single Prisma
 * transaction to avoid race conditions between concurrent requests:
 * validate, compare, upsert, count.
 *
 * The read cursor only ever moves forward — a stale cursor is ignored but the
 * unread count is still recomputed so the caller gets a consistent answer.
 *
 * Returns the acknowledged cursor and the computed unread count.
 */
export async function markConversationRead(
  userId: string,
  lastReadMessageId: string,
  options: MarkReadOptions,
): Promise<{ lastReadMessageId: string; unreadCount: number }> {
  const { scopeField, scopeId, receiptModel, receiptWhere, wrongScope } =
    options;

  const unreadCount = await prisma.$transaction(async (tx) => {
    // 1. Verify the message exists and belongs to this conversation.
    const message = await tx.message.findUnique({
      where: { id: lastReadMessageId },
      select: {
        id: true,
        createdAt: true,
        [scopeField]: true,
      } as Prisma.MessageSelect,
    });

    if (!message) {
      throw new ApiError("Message not found", 404, "MESSAGE_NOT_FOUND");
    }

    if (message[scopeField] !== scopeId) {
      throw new ApiError(wrongScope.message, 400, wrongScope.code);
    }

    const createdAt = message.createdAt as Date;
    const receipts = tx[receiptModel] as unknown as ReadReceiptDelegate;

    // 2. Fetch the existing receipt (if any).
    const existing = await receipts.findUnique({
      where: receiptWhere,
      select: { lastReadMessageCreatedAt: true },
    });

    const countUnreadAfter = (after: Date) =>
      tx.message.count({
        where: {
          [scopeField]: scopeId,
          senderId: { not: userId },
          isDeleted: false,
          createdAt: { gt: after },
        } as Prisma.MessageWhereInput,
      });

    // 3. Only update if the incoming cursor is strictly newer.
    if (
      existing?.lastReadMessageCreatedAt &&
      existing.lastReadMessageCreatedAt >= createdAt
    ) {
      // Cursor is not moving forward — skip update, still compute count.
      return countUnreadAfter(existing.lastReadMessageCreatedAt);
    }

    // 4. Upsert the receipt with the new cursor.
    await receipts.upsert({
      where: receiptWhere,
      create: {
        userId,
        [scopeField]: scopeId,
        lastReadMessageId,
        lastReadMessageCreatedAt: createdAt,
      },
      update: {
        lastReadMessageId,
        lastReadMessageCreatedAt: createdAt,
      },
    });

    // 5. Compute unread count after advancing the cursor.
    return countUnreadAfter(createdAt);
  });

  return { lastReadMessageId, unreadCount };
}
