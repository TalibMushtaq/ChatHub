import { DELETE_WINDOW_MS } from "../../constants/room";
import { deleteMessageInScope } from "../message/mutations";

/**
 * Soft-delete a room message within the delete window.
 *
 * Thin scope binding around the shared message mutation; see
 * `services/message/mutations` for the authorization rules.
 *
 * Returns the deleted message stub with id, chatRoomId, deletedAt.
 */
export async function deleteMessage(userId: string, messageId: string) {
  return deleteMessageInScope(userId, messageId, {
    scopeField: "chatRoomId",
    deleteWindowMs: DELETE_WINDOW_MS,
  });
}
