import { prisma } from "../../../db/prisma";
import type { Relationship } from "@repo/validators";

/**
 * Batch version of getRelationship for a list of target users (search results).
 *
 * Runs exactly four `IN` queries (blocks, friendships, sent requests, received
 * requests) instead of 4 queries per user, then merges in memory — the cost
 * stays flat as the result set grows, so search results can annotate every
 * row with a `relationship` field without an N+1.
 */
export async function getRelationships(
  actorId: string,
  userIds: string[],
): Promise<Map<string, Relationship>> {
  const uniqueIds = [...new Set(userIds)];
  const map = new Map<string, Relationship>(uniqueIds.map((id) => [id, "NONE"]));
  if (uniqueIds.length === 0) return map;

  const pairFilter = (left: string, right: string) => [
    { [left]: actorId, [right]: { in: uniqueIds } },
    { [left]: { in: uniqueIds }, [right]: actorId },
  ];

  const [blocks, friendships, sentRequests, receivedRequests] =
    await Promise.all([
      prisma.userBlock.findMany({
        where: { OR: pairFilter("blockerId", "blockedId") },
        select: { blockerId: true, blockedId: true },
      }),
      prisma.friendship.findMany({
        where: { OR: pairFilter("userAId", "userBId") },
        select: { userAId: true, userBId: true },
      }),
      prisma.friendRequest.findMany({
        where: {
          senderId: actorId,
          recipientId: { in: uniqueIds },
          status: "PENDING",
        },
        select: { recipientId: true },
      }),
      prisma.friendRequest.findMany({
        where: {
          senderId: { in: uniqueIds },
          recipientId: actorId,
          status: "PENDING",
        },
        select: { senderId: true },
      }),
    ]);

  const blockedSet = new Set(
    blocks.map((b) => (b.blockerId === actorId ? b.blockedId : b.blockerId)),
  );
  const friendSet = new Set(
    friendships.map((f) => (f.userAId === actorId ? f.userBId : f.userAId)),
  );
  const sentSet = new Set(sentRequests.map((r) => r.recipientId));
  const receivedSet = new Set(receivedRequests.map((r) => r.senderId));

  // Same precedence as getRelationship: block > friends > sent > received.
  for (const id of uniqueIds) {
    if (blockedSet.has(id)) map.set(id, "BLOCKED");
    else if (friendSet.has(id)) map.set(id, "FRIENDS");
    else if (sentSet.has(id)) map.set(id, "REQUEST_SENT");
    else if (receivedSet.has(id)) map.set(id, "REQUEST_RECEIVED");
  }
  return map;
}
