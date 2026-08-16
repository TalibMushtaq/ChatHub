import { prisma } from "../../../db/prisma";
import type { Relationship } from "@repo/validators";

/**
 * Derive the relationship between `actorId` and `userId` purely from DB state.
 *
 * Precedence matters: a block overrides every other state, then friendship,
 * then the direction of any PENDING request. The client never sends its own
 * relationship — every UI chip is re-derived here so it cannot go stale.
 */
export async function getRelationship(
  actorId: string,
  userId: string,
): Promise<Relationship> {
  if (actorId === userId) return "NONE";

  const [blocked, friendship, sent, received] = await Promise.all([
    prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: actorId, blockedId: userId },
          { blockerId: userId, blockedId: actorId },
        ],
      },
      select: { id: true },
    }),
    prisma.friendship.findFirst({
      where: {
        OR: [
          { userAId: actorId, userBId: userId },
          { userAId: userId, userBId: actorId },
        ],
      },
      select: { id: true },
    }),
    prisma.friendRequest.findFirst({
      where: { senderId: actorId, recipientId: userId, status: "PENDING" },
      select: { id: true },
    }),
    prisma.friendRequest.findFirst({
      where: { senderId: userId, recipientId: actorId, status: "PENDING" },
      select: { id: true },
    }),
  ]);

  if (blocked) return "BLOCKED";
  if (friendship) return "FRIENDS";
  if (sent) return "REQUEST_SENT";
  if (received) return "REQUEST_RECEIVED";
  return "NONE";
}
