import { markConversationRead } from "../message/markRead";

/**
 * Mark a room channel as read for the given user.
 *
 * Thin scope binding around the shared read-receipt transaction; see
 * `services/message/markRead`. Uses the Message.channelId column as the scope
 * so one channel's cursor is independent of the room's aggregate cursor.
 *
 * Returns the updated receipt and the computed per-channel unread count.
 */
export async function markChannelRead(
  userId: string,
  channelId: string,
  lastReadMessageId: string,
) {
  return markConversationRead(userId, lastReadMessageId, {
    scopeField: "channelId",
    scopeId: channelId,
    receiptModel: "channelReadReceipt",
    receiptWhere: { userId_channelId: { userId, channelId } },
    wrongScope: {
      message: "Message does not belong to this channel",
      code: "MESSAGE_WRONG_CHANNEL",
    },
  });
}
