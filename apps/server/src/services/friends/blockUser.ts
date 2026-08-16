import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";
import { friendUserSelect } from "../../constants/friends";

/**
 * Block `blockedUserId`. Blocking is a hard state transition from any
 * relationship: the block row is created (or kept, if already present) and any
 * PENDING friend requests between the pair are deleted in BOTH directions —
 * so blocking also clears the other side's inbox card and closes any send/accept
 * race for the pair.
 *
 * Idempotent: blocking someone already blocked is a no-op (P2002 → keep the
 * existing row) rather than an error, so retries and double-clicks are safe.
 *
 * On unblock the block is simply removed — no friendship and no request are
 * restored; the pair returns to NONE and must start over.
 */
export async function blockUser(blockerId: string, blockedUserId: string) {
  if (blockerId === blockedUserId) {
    throw new ApiError("cannot block yourself", 400, "SELF_BLOCK");
  }

  const result = await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: blockedUserId },
      select: friendUserSelect,
    });
    if (!target) {
      throw new ApiError("user not found", 404, "USER_NOT_FOUND");
    }

    // Clear pending requests in both directions inside the same transaction so
    // the recipient's inbox can't keep showing a card for a now-blocked user.
    await tx.friendRequest.deleteMany({
      where: {
        status: "PENDING",
        OR: [
          { senderId: blockerId, recipientId: blockedUserId },
          { senderId: blockedUserId, recipientId: blockerId },
        ],
      },
    });

    let blockedAt: Date;
    try {
      const row = await tx.userBlock.create({
        data: { blockerId, blockedId: blockedUserId },
        select: { createdAt: true },
      });
      blockedAt = row.createdAt;
    } catch (err: unknown) {
      // Already blocked → keep the existing row and carry on (idempotent).
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const existing = await tx.userBlock.findFirst({
          where: { blockerId, blockedId: blockedUserId },
          select: { createdAt: true },
        });
        blockedAt = existing?.createdAt ?? new Date();
      } else {
        throw err;
      }
    }

    return { target, blockedAt };
  });

  return { blockedUser: { ...result.target, blockedAt: result.blockedAt } };
}
