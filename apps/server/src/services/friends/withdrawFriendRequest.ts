import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";

/**
 * Withdraw (cancel) a PENDING friend request. Only the original sender may
 * withdraw; scoping the where clause to `senderId` makes someone else's
 * request id 404. The row is deleted (not flipped to DECLINED) so a withdrawn
 * request leaves no trace and the pair is free to re-request.
 *
 * Scoping to `status: PENDING` means a concurrent accept from the recipient
 * wins: updateMany matches 0 rows and we surface a 409 instead of deleting an
 * already-accepted request.
 */
export async function withdrawFriendRequest(
  senderId: string,
  requestId: string,
) {
  const request = await prisma.friendRequest.findFirst({
    where: { id: requestId, senderId, status: "PENDING" },
    select: { id: true, recipientId: true },
  });
  if (!request) {
    throw new ApiError("friend request not found", 404, "REQUEST_NOT_FOUND");
  }

  const result = await prisma.friendRequest.deleteMany({
    where: { id: requestId, senderId, status: "PENDING" },
  });
  if (result.count === 0) {
    throw new ApiError(
      "friend request already handled",
      409,
      "REQUEST_ALREADY_HANDLED",
    );
  }

  return { requestId: request.id, recipientId: request.recipientId };
}
