import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";
import { friendRequestSelect } from "../../constants/friends";
import { makePairKey } from "../../lib/friendPairKey";

/**
 * Send a PENDING friend request from `senderId` to `recipientId`.
 *
 * Every guard (self-request, target existence, block, already friends,
 * duplicate request) and the insert run inside ONE interactive transaction so
 * a concurrent conflicting write cannot slip between a check and its insert.
 *
 * Race safety:
 * - Two identical A→B sends: both transactions pass the "no existing request"
 *   read, then the second INSERT hits the (senderId, recipientId) direction
 *   uniqueness — wait, there is none — instead the partial unique index on
 *   `pairKey` (WHERE status = 'PENDING') rejects the loser with P2002.
 * - A→B vs B→A at the same time: both share the same `pairKey`, so the partial
 *   unique index still lets exactly one commit; the other gets P2002 → 409.
 */
export async function sendFriendRequest(senderId: string, recipientId: string) {
  if (senderId === recipientId) {
    throw new ApiError(
      "cannot send a friend request to yourself",
      400,
      "SELF_FRIEND_REQUEST",
    );
  }

  const pairKey = makePairKey(senderId, recipientId);

  return prisma.$transaction(async (tx) => {
    const recipient = await tx.user.findUnique({
      where: { id: recipientId },
      select: { id: true },
    });
    if (!recipient) {
      throw new ApiError("user not found", 404, "USER_NOT_FOUND");
    }

    // Block is checked in both directions: neither side may initiate a request
    // while either has blocked the other.
    const block = await tx.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: recipientId },
          { blockerId: recipientId, blockedId: senderId },
        ],
      },
      select: { id: true },
    });
    if (block) {
      throw new ApiError("cannot send a friend request", 403, "BLOCKED");
    }

    const friendship = await tx.friendship.findFirst({
      where: {
        OR: [
          { userAId: senderId, userBId: recipientId },
          { userAId: recipientId, userBId: senderId },
        ],
      },
      select: { id: true },
    });
    if (friendship) {
      throw new ApiError("already friends", 409, "ALREADY_FRIENDS");
    }

    // A declined request is not a barrier: the sender is free to try again
    // later. Only an existing PENDING request blocks a re-send.
    const existing = await tx.friendRequest.findFirst({
      where: { senderId, recipientId, status: "PENDING" },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError(
        "friend request already sent",
        409,
        "REQUEST_ALREADY_SENT",
      );
    }

    try {
      return await tx.friendRequest.create({
        data: { senderId, recipientId, pairKey, status: "PENDING" },
        select: friendRequestSelect,
      });
    } catch (err: unknown) {
      // Partial-unique-index backstop for the mutual-request race (A→B vs
      // B→A): both share the same pairKey, so the second commit fails with
      // P2002 even though both passed the read check above.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ApiError(
          "friend request already sent",
          409,
          "REQUEST_ALREADY_SENT",
        );
      }
      throw err;
    }
  });
}
