import { prisma } from "../../../db/prisma";

/**
 * The id of any PENDING friend request between `actorId` and `userId`, in
 * either direction. The profile card needs it to cancel/accept/decline a
 * request — the derived `relationship` alone can't address the request row.
 */
export async function getPendingRequestId(
  actorId: string,
  userId: string,
): Promise<string | null> {
  const req = await prisma.friendRequest.findFirst({
    where: {
      status: "PENDING",
      OR: [
        { senderId: actorId, recipientId: userId },
        { senderId: userId, recipientId: actorId },
      ],
    },
    select: { id: true },
  });
  return req?.id ?? null;
}
