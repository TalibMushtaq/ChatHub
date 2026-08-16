import { prisma } from "../../../db/prisma";
import { friendUserSelect } from "../../constants/friends";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../constants/friends";

/**
 * Load the list of users blocked by `blockerId` with cursor pagination.
 *
 * Only the blocker can see their own list (scoped by `blockerId`). Each entry
 * carries the blocked user's summary plus the timestamp of the block so the
 * settings UI can render both the row and the option to unblock.
 */
export async function getBlockedUsers(
  blockerId: string,
  options: { cursor?: string; limit?: number } = {},
) {
  const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const hasCursor = !!options.cursor;

  const rows = await prisma.userBlock.findMany({
    where: { blockerId },
    ...(hasCursor && { cursor: { id: options.cursor! }, skip: 1 }),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      createdAt: true,
      blocked: { select: friendUserSelect },
    },
  });

  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;

  return {
    blockedUsers: sliced.map((row) => ({
      ...row.blocked,
      blockedAt: row.createdAt,
    })),
    nextCursor: hasMore ? (sliced[sliced.length - 1]?.id ?? null) : null,
  };
}
