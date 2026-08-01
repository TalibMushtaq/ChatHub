// Prisma must be imported from @prisma/client because db/prisma only
// exports the instantiated client, not the namespace containing
// PrismaClientKnownRequestError.
import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";
import { chatSelect } from "../../constants/direct-chat";

/**
 * Start a direct chat between two users.
 *
 * Uses create-first to avoid the race condition in findUnique→create.
 * If another request wins the race (P2002), we fall back to findUnique
 * and return the existing chat with created=false.
 *
 * Behavior preserved from original:
 * - 400 if user tries to DM themselves
 * - 404 if target user does not exist
 * - Returns { chat, created: boolean } with 200 status either way
 */
export async function startDirectChat(myId: string, otherId: string) {
  if (myId === otherId) {
    throw new ApiError("cannot DM yourself", 400, "SELF_DM");
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: otherId },
    select: { id: true },
  });
  if (!targetUser) {
    throw new ApiError("target user not found ", 404, "USER_NOT_FOUND");
  }

  const user1Id = myId < otherId ? myId : otherId;
  const user2Id = myId < otherId ? otherId : myId;

  try {
    const chat = await prisma.directChat.create({
      data: { user1Id, user2Id },
      select: chatSelect,
    });
    return { chat, created: true };
  } catch (err: unknown) {
    // P2002 = unique constraint violation on (user1Id, user2Id).
    // This means a concurrent request created the chat between our
    // check and our create, so we fall back to fetching it.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.directChat.findUnique({
        where: { user1Id_user2Id: { user1Id, user2Id } },
        select: chatSelect,
      });
      if (!existing) {
        throw new ApiError("chat not found", 404, "CHAT_NOT_FOUND");
      }
      return { chat: existing, created: false };
    }
    throw err;
  }
}
