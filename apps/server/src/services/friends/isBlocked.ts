import { prisma } from "../../../db/prisma";

/**
 * True when either user has blocked the other.
 *
 * Blocking is symmetric for both enforcement and visibility: if A blocks B,
 * neither may initiate anything with the other. This is the single reusable
 * check every friend/block path must call, so the semantics can never drift
 * between endpoints.
 */
export async function isBlocked(
  userId: string,
  targetUserId: string,
): Promise<boolean> {
  if (userId === targetUserId) return false;

  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: targetUserId },
        { blockerId: targetUserId, blockedId: userId },
      ],
    },
    select: { id: true },
  });
  return block !== null;
}
