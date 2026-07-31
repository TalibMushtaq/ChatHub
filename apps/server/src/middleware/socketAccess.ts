import { prisma } from "../../db/prisma";
import { ForbiddenError } from "../lib/AppError";

/**
 * Asserts that the user is a member of the specified chat room.
 *
 * @param userId    - The ID of the user to check.
 * @param chatRoomId - The ID of the chat room.
 * @throws {ForbiddenError} If the user is not a member of the room.
 *
 * Why this design:
 * - Uses `findUnique` with the compound unique constraint (userId, chatRoomId)
 *   for an O(1) primary-key lookup — no OR clauses, no full-table scan.
 * - Only selects `id` (existence check) — no unnecessary columns.
 * - Throws a typed `ForbiddenError` (HTTP 403) so callers can distinguish
 *   authorization failures from unexpected errors without string comparison.
 * - Framework-agnostic: no Express, no HTTP, no logging. Pure authorization logic.
 * - Prepared for future caching: the (userId, chatRoomId) key is stable and
 *   can be cached in Redis without significant refactoring.
 */
export async function assertRoomAccess(
  userId: string,
  chatRoomId: string,
): Promise<void> {
  const membership = await prisma.chatRoomMember.findUnique({
    where: {
      userId_chatRoomId: { userId, chatRoomId },
    },
    select: { id: true },
  });

  if (!membership) {
    throw new ForbiddenError("Not authorized for this room");
  }
}

/**
 * Asserts that the user is a participant in the specified direct chat.
 *
 * @param userId       - The ID of the user to check.
 * @param directChatId - The ID of the direct chat.
 * @throws {ForbiddenError} If the user is not a participant.
 *
 * Why `findUnique` + in-memory check instead of `findFirst` with OR:
 * - The DirectChat schema has a unique constraint on (user1Id, user2Id),
 *   but the order matters. We fetch by ID (O(1) primary-key lookup) and
 *   check both fields in memory — this is faster and cleaner than an
 *   `OR` query that may not use indexes efficiently.
 * - Only selects `user1Id` and `user2Id` for the participation check.
 * - Prepared for future caching by directChatId.
 */
export async function assertDirectChatAccess(
  userId: string,
  directChatId: string,
): Promise<void> {
  const chat = await prisma.directChat.findUnique({
    where: { id: directChatId },
    select: { user1Id: true, user2Id: true },
  });

  if (!chat || (chat.user1Id !== userId && chat.user2Id !== userId)) {
    throw new ForbiddenError("Not authorized for this chat");
  }
}
