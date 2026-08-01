import { prisma } from "../../../db/prisma";

/**
 * Load the direct-chat inbox for a user.
 *
 * Returns one entry per chat with:
 * - directChatId
 * - otherUser (id, username, avatar)
 * - lastMessage (most recent message stub, or null)
 * - createdAt
 *
 * Preserves exact original response shape.
 */
export async function getInbox(userId: string) {
  const chats = await prisma.directChat.findMany({
    where: {
      OR: [{ user1Id: userId }, { user2Id: userId }],
    },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      user1Id: true,
      user2Id: true,
      createdAt: true,
      User_DirectChat_user1IdToUser: {
        select: { id: true, username: true, avatar: true },
      },
      User_DirectChat_user2IdToUser: {
        select: { id: true, username: true, avatar: true },
      },
      Message: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          content: true,
          messageType: true,
          createdAt: true,
          isDeleted: true,
        },
      },
    },
  });

  // Intentionally do not filter isDeleted from lastMessage; the frontend
  // uses the isDeleted flag to render a soft-delete marker, and hiding
  // the entry would break scroll position and reply-chain integrity.
  const inbox = chats.map((chat) => {
    const otherUser =
      chat.user1Id === userId
        ? chat.User_DirectChat_user2IdToUser
        : chat.User_DirectChat_user1IdToUser;
    return {
      directChatId: chat.id,
      otherUser,
      lastMessage: chat.Message[0] ?? null,
      createdAt: chat.createdAt,
    };
  });

  return inbox;
}
