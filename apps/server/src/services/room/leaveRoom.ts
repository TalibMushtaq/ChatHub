import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";
import { getRoomRole } from "./permissions";

/**
 * Remove the caller's own membership from a Room (Phase 2 §6.1 "Leave Room").
 *
 * Owner transfer/delete are Phase 5 concerns, so the owner is explicitly
 * rejected here — an owner leaving would orphan the room. Member read
 * receipts are cleaned up alongside the membership so the room's unread
 * computations stop counting a user who is no longer part of it.
 */
export async function leaveRoom(userId: string, roomId: string) {
  // getRoomRole doubles as the membership check (403 for non-members).
  const role = await getRoomRole(userId, roomId);
  if (role === "OWNER") {
    throw new ApiError(
      "The room owner cannot leave — transfer ownership or delete the room instead",
      403,
      "FORBIDDEN",
    );
  }

  await prisma.$transaction([
    prisma.chatRoomMember.deleteMany({
      where: { userId, chatRoomId: roomId },
    }),
    // A leaver's read cursor is meaningless after they leave; dropping it keeps
    // unread aggregation and the member list consistent.
    prisma.chatRoomReadReceipt.deleteMany({
      where: { userId, chatRoomId: roomId },
    }),
  ]);
}
