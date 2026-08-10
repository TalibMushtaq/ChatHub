import { markConversationRead } from "../message/markRead";

/**
 * Mark a chat room as read for the given user.
 *
 * Thin scope binding around the shared read-receipt transaction; see
 * `services/message/markRead`.
 *
 * Returns the updated receipt and the computed unread count.
 */
export async function markRoomRead(
  userId: string,
  chatRoomId: string,
  lastReadMessageId: string,
) {
  return markConversationRead(userId, lastReadMessageId, {
    scopeField: "chatRoomId",
    scopeId: chatRoomId,
    receiptModel: "chatRoomReadReceipt",
    receiptWhere: { userId_chatRoomId: { userId, chatRoomId } },
    wrongScope: {
      message: "Message does not belong to this room",
      code: "MESSAGE_WRONG_ROOM",
    },
  });
}
