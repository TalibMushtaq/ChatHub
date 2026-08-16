import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";
import { friendRequestSelect } from "../../constants/friends";

/**
 * Accept a PENDING friend request. Only the recipient may accept, enforced by
 * scoping the lookup to `recipientId` so a guessed request id belonging to
 * another user is indistinguishable from a missing one (404).
 *
 * The transition (PENDING → ACCEPTED) and the Friendship creation share one
 * transaction so a crash between the two can never leave a request accepted
 * without a friendship. Block is re-checked inside the transaction: the
 * recipient may have blocked the sender after the request was received.
 *
 * Race safety: two concurrent accepts (recipient on two devices) both attempt
 * Friendship creation; the loser hits the (userAId, userBId) unique constraint
 * with P2002, which is caught and treated as idempotent success.
 */
export async function acceptFriendRequest(
  recipientId: string,
  requestId: string,
) {
  const request = await prisma.friendRequest.findFirst({
    where: { id: requestId, recipientId, status: "PENDING" },
    select: { id: true, senderId: true, recipientId: true },
  });
  if (!request) {
    throw new ApiError("friend request not found", 404, "REQUEST_NOT_FOUND");
  }

  // Friendship is symmetric, so the pair is stored with the smaller id first
  // (same normalized-ordering rule as DirectChat) — this is what makes the
  // unique constraint reject a duplicate regardless of who initiated.
  const userAId =
    request.senderId < request.recipientId ? request.senderId : request.recipientId;
  const userBId =
    request.senderId < request.recipientId ? request.recipientId : request.senderId;

  try {
    return await prisma.$transaction(async (tx) => {
      const block = await tx.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: request.senderId, blockedId: recipientId },
            { blockerId: recipientId, blockedId: request.senderId },
          ],
        },
        select: { id: true },
      });
      if (block) {
        throw new ApiError("cannot accept friend request", 403, "BLOCKED");
      }

      const updated = await tx.friendRequest.update({
        where: { id: request.id },
        data: { status: "ACCEPTED" },
        select: friendRequestSelect,
      });

      await tx.friendship.create({
        data: { userAId, userBId },
        select: { id: true },
      });

      return updated;
    });
  } catch (err: unknown) {
    // P2002 here can only mean the friendship already exists (concurrent
    // accept or an edge case where they became friends another way). The
    // request was already flipped to ACCEPTED in that winning transaction,
    // so we re-read it and report success — idempotent, no duplicate row.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const accepted = await prisma.friendRequest.findUnique({
        where: { id: request.id },
        select: friendRequestSelect,
      });
      if (!accepted) {
        throw new ApiError("friend request not found", 404, "REQUEST_NOT_FOUND");
      }
      return accepted;
    }
    throw err;
  }
}
