import { DELETE_WINDOW_MS } from "../../constants/room";
import { deleteMessageInScope } from "../message/mutations";

/**
 * Soft-delete a room message within the delete window.
 *
 * Thin scope binding around the shared message mutation; see
 * `services/message/mutations` for the authorization rules.
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
  return deleteMessageInScope(userId, messageId, {
    scopeField: "chatRoomId",
    scopeId: chatRoomId,
    deleteWindowMs: DELETE_WINDOW_MS,
  });
}
