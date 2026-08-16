import { prisma } from "../../../db/prisma";
import { friendRequestSelect } from "../../constants/friends";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../constants/friends";

/**
 * Load the incoming PENDING friend requests for a user with cursor pagination.
 *
 * Returns one entry per request with the sender's summary. Same cursor pattern
 * as getInbox: cursor is keyed on the unique `id` while the sort stays stable,
 * so Prisma can index-seek to the cursor row and continue the ordering.
 */
export async function getPendingRequests(
  recipientId: string,
  options: { cursor?: string; limit?: number } = {},
) {
  const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const hasCursor = !!options.cursor;

  const requests = await prisma.friendRequest.findMany({
    where: { recipientId, status: "PENDING" },
    ...(hasCursor && { cursor: { id: options.cursor! }, skip: 1 }),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: friendRequestSelect,
  });

  const hasMore = requests.length > limit;
  const sliced = hasMore ? requests.slice(0, limit) : requests;

  return {
    requests: sliced,
    nextCursor: hasMore ? (sliced[sliced.length - 1]?.id ?? null) : null,
  };
}
