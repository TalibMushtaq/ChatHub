import { prisma } from "../../../db/prisma";

/**
 * Remove the block from `blockerId` to `blockedUserId`.
 *
 * Idempotent on purpose: `deleteMany` matches zero rows for a non-existent
 * block and we still report success, so double-clicks and retries are safe.
 * The block is NOT restored by this call — the pair simply returns to NONE
 * and any future friendship must start from a fresh friend request.
 */
export async function unblockUser(blockerId: string, blockedUserId: string) {
  await prisma.userBlock.deleteMany({
    where: { blockerId, blockedId: blockedUserId },
  });
  return { blockedId: blockedUserId };
}
