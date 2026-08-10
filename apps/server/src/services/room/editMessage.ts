import { EDIT_WINDOW_MS } from "../../constants/room";
import { editMessageInScope } from "../message/mutations";

/**
 * Edit a room message within the edit window.
 *
 * Thin scope binding around the shared message mutation; see
 * `services/message/mutations` for the authorization rules.
 *
 * Scoping the lookup to `chatRoomId` is what makes the caller's room-level
 * authorization meaningful: without it, a member of any room could edit one of
 * their own messages from a different room or direct chat.
 *
 * Returns the updated message with id, content, editedAt, chatRoomId.
 */
export async function editMessage(
  userId: string,
  chatRoomId: string,
  messageId: string,
  content: string,
) {
  return editMessageInScope(userId, messageId, content, {
    scopeField: "chatRoomId",
    scopeId: chatRoomId,
    editWindowMs: EDIT_WINDOW_MS,
  });
}
