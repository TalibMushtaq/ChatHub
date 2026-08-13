import { prisma } from "../../../db/prisma";

/**
 * List members of a chat room with their user info and role.
 *
 * Returns members ordered by role (OWNER first) then joined-at so admins see
 * the owner at the top of the room info panel. Only the fields the room info
 * UI renders are selected — no attachment blobs or message bodies.
 */
export async function getMembers(chatRoomId: string) {
  const members = await prisma.chatRoomMember.findMany({
    where: { chatRoomId },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    select: {
      id: true,
      role: true,
      joinedAt: true,
      User: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
        },
      },
    },
  });

  return members.map((m) => ({
    memberId: m.id,
    role: m.role,
    joinedAt: m.joinedAt,
    user: m.User,
  }));
}
