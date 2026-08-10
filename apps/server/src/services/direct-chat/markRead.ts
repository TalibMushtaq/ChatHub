import { markConversationRead } from "../message/markRead";

/**
 * Mark a direct chat as read for the given user.
 *
 * Thin scope binding around the shared read-receipt transaction; see
 * `services/message/markRead`.
 *
 * Returns the updated receipt and the computed unread count.
 */
export async function markDirectChatRead(
  userId: string,
  directChatId: string,
  lastReadMessageId: string,
) {
  return markConversationRead(userId, lastReadMessageId, {
    scopeField: "directChatId",
    scopeId: directChatId,
    receiptModel: "directChatReadReceipt",
    receiptWhere: { userId_directChatId: { userId, directChatId } },
    wrongScope: {
      message: "Message does not belong to this conversation",
      code: "MESSAGE_WRONG_CHAT",
    },
  });
}
