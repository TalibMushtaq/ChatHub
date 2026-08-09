import { DELETE_WINDOW_MS } from "../../constants/direct-chat";
import { deleteMessageInScope } from "../message/mutations";

/**
 * Soft-delete a direct-chat message within the delete window.
 *
 * Thin scope binding around the shared message mutation; see
 * `services/message/mutations` for the authorization rules.
 *
 * Returns the deleted message stub with id, directChatId, deletedAt.
 */
export async function deleteMessage(userId: string, messageId: string) {
  return deleteMessageInScope(userId, messageId, {
    scopeField: "directChatId",
    deleteWindowMs: DELETE_WINDOW_MS,
  });
}
