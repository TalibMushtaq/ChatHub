import { EDIT_WINDOW_MS } from "../../constants/direct-chat";
import { editMessageInScope } from "../message/mutations";

/**
 * Edit a direct-chat message within the edit window.
 *
 * Thin scope binding around the shared message mutation; see
 * `services/message/mutations` for the authorization rules.
 *
 * Returns the updated message with id, content, editedAt, directChatId.
 */
export async function editMessage(
  userId: string,
  messageId: string,
  content: string,
) {
  return editMessageInScope(userId, messageId, content, {
    scopeField: "directChatId",
    editWindowMs: EDIT_WINDOW_MS,
  });
}
