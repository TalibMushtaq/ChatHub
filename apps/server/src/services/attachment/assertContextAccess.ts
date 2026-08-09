import {
  assertRoomAccess,
  assertDirectChatAccess,
} from "../../middleware/socketAccess";
import { ApiError } from "../../lib/ApiError";

/**
 * Assert the uploader may upload into the given attachment context.
 *
 * The context/contextId pair determines the S3 key prefix, so without this
 * check any authenticated user could write objects into the prefix of a room
 * or direct chat they are not part of.
 *
 * "voice" recordings are sent in either a room or a direct chat, so the id is
 * accepted if it resolves to either.
 */
export async function assertUploadContextAccess(
  userId: string,
  context: "room" | "dm" | "voice",
  contextId: string,
): Promise<void> {
  if (context === "room") {
    await assertRoomAccess(userId, contextId);
    return;
  }

  if (context === "dm") {
    await assertDirectChatAccess(userId, contextId);
    return;
  }

  try {
    await assertDirectChatAccess(userId, contextId);
  } catch {
    try {
      await assertRoomAccess(userId, contextId);
    } catch {
      throw new ApiError("Not authorized for this context", 403, "FORBIDDEN");
    }
  }
}
