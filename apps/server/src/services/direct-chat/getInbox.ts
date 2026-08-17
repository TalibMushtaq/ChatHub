import { prisma } from "../../../db/prisma";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../constants/direct-chat";

/**
 * Load the direct-chat inbox for a user with cursor pagination.
 *
 * Returns one entry per chat with:
 * - directChatId
 * - otherUser (id, username, avatar)
 * - lastMessage (most recent message stub, or null)
 * - unreadCount (messages from other user after the last read cursor)
 * - createdAt
 *
 * Unread count is computed in a single batch query to avoid N+1.
 * A null cursor (or no receipt) counts all messages from other users as unread.
 */
export async function getInbox(
  userId: string,
  options: { cursor?: string; limit?: number } = {},
) {
  const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const hasCursor = !!options.cursor;

  // 1. Fetch one page of chats (limit + 1 to detect whether more pages exist).
  const chats = await prisma.directChat.findMany({
    where: {
      OR: [{ user1Id: userId }, { user2Id: userId }],
    },
    // Cursor is keyed on the unique `id` while the sort keys stay stable,
    // so Prisma can index-seek to the cursor row and continue the ordering.
    ...(hasCursor && { cursor: { id: options.cursor! }, skip: 1 }),
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take: limit + 1,
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
          // Only the duration is needed so list previews can render a voice
          // message as "🎤 Voice message (0:12)" without a second query.
          attachments: { select: { duration: true } },
        },
      },
    },
  });

  const hasMore = chats.length > limit;
  const sliced = hasMore ? chats.slice(0, limit) : chats;

  if (sliced.length === 0)
    return { inbox: [], nextCursor: null as string | null };

  // 2. Batch-compute unread counts using a single raw query.
  //    For chats with a cursor: count messages where createdAt > cursor AND senderId != userId.
  //    For chats without a cursor: count all messages where senderId != userId.
  const chatIds = sliced.map((c) => c.id);

  const unreadRows = await prisma.$queryRaw<
    { directChatId: string; count: bigint }[]
  >`
    SELECT
      m."directChatId" as "directChatId",
      COUNT(*)::int as count
    FROM "Message" m
    LEFT JOIN "DirectChatReadReceipt" r
      ON r."userId" = ${userId}
      AND r."directChatId" = m."directChatId"
    WHERE m."directChatId" = ANY(${chatIds})
      AND m."senderId" != ${userId}
      AND m."isDeleted" = false
      AND (
        r."lastReadMessageCreatedAt" IS NULL
        OR m."createdAt" > r."lastReadMessageCreatedAt"
      )
    GROUP BY m."directChatId"
  `;

  const unreadMap = new Map(
    unreadRows.map((row) => [row.directChatId, Number(row.count)]),
  );

  // 3. Assemble the inbox with unread counts.
  const inbox = sliced.map((chat) => {
    const otherUser =
      chat.user1Id === userId
        ? chat.User_DirectChat_user2IdToUser
        : chat.User_DirectChat_user1IdToUser;
    return {
      directChatId: chat.id,
      otherUser,
      lastMessage: chat.Message[0] ?? null,
      unreadCount: unreadMap.get(chat.id) ?? 0,
      createdAt: chat.createdAt,
    };
  });

  return {
    inbox,
    nextCursor: hasMore ? (sliced[sliced.length - 1]?.id ?? null) : null,
  };
}
