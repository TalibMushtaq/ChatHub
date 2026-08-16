import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";

/**
 * Decline a PENDING friend request. Only the recipient may decline; scoping
 * the where clause to `recipientId` makes someone else's request id 404.
 *
 * The update is additionally scoped to `status: PENDING`, so a concurrent
 * accept from another device wins: updateMany matches 0 rows and we surface a
 * 409 instead of silently flipping an already-accepted request to DECLINED.
 */
export async function declineFriendRequest(
  recipientId: string,
  requestId: string,
) {
  const request = await prisma.friendRequest.findFirst({
    where: { id: requestId, recipientId, status: "PENDING" },
    select: { id: true, senderId: true },
  });
  if (!request) {
    throw new ApiError("friend request not found", 404, "REQUEST_NOT_FOUND");
  }

  const result = await prisma.friendRequest.updateMany({
    where: { id: requestId, recipientId, status: "PENDING" },
    data: { status: "DECLINED" },
  });
  if (result.count === 0) {
    throw new ApiError(
      "friend request already handled",
      409,
      "REQUEST_ALREADY_HANDLED",
    );
  }

  return { requestId: request.id, senderId: request.senderId };
}
