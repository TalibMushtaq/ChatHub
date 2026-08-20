import { prisma } from "../../../db/prisma";

/**
 * Per-channel unread computation (Phase 6 §10.1).
 *
 * A channel is:
 * - "read" when no messages from others exist after the user's read cursor;
 * - "unread" when the unread message count is > 0;
 * - "mentioned" when an unread message @-mentions the user;
 * - "muted" when the member's room notification pref is MUTED (the pref itself
 *   lives on ChatRoomMember and is resolved by the caller/sidebar, so this
 *   service only reports counts).
 *
 * All queries batch across rooms/channels so the rooms list pays one query per
 * concern instead of an N+1 per channel.
 */

export type ChannelUnreadState = {
  unreadCount: number;
  mentionCount: number;
};

export type RoomChannelUnreads = {
  roomId: string;
  channels: Record<string, ChannelUnreadState>;
};

/** Batch per-channel unread + mention counts for all of a user's rooms. */
export async function getRoomsChannelUnreads(
  userId: string,
  roomIds: string[],
): Promise<RoomChannelUnreads[]> {
  if (roomIds.length === 0) return [];

  // One query: messages (after the channel cursor, from others, not deleted)
  // grouped by channel, for every channel in the given rooms.
  const unreadRows = await prisma.$queryRaw<
    {
      channelId: string;
      roomId: string;
      count: number;
    }[]
  >`
    SELECT
      m."channelId" as "channelId",
      m."chatRoomId" as "roomId",
      COUNT(*)::int as count
    FROM "Message" m
    LEFT JOIN "ChannelReadReceipt" r
      ON r."userId" = ${userId}
      AND r."channelId" = m."channelId"
    WHERE m."chatRoomId" = ANY(${roomIds})
      AND m."channelId" IS NOT NULL
      AND m."senderId" != ${userId}
      AND m."isDeleted" = false
      AND (
        r."lastReadMessageCreatedAt" IS NULL
        OR m."createdAt" > r."lastReadMessageCreatedAt"
      )
    GROUP BY m."channelId", m."chatRoomId"
  `;

  // One query: unread mentions — MessageMention rows for this user on messages
  // from others that fall after the channel cursor.
  const mentionRows = await prisma.$queryRaw<
    {
      channelId: string;
      roomId: string;
      count: number;
    }[]
  >`
    SELECT
      mm."channelId" as "channelId",
      mm."roomId" as "roomId",
      COUNT(*)::int as count
    FROM "MessageMention" mm
    JOIN "Message" m ON m."id" = mm."messageId"
    LEFT JOIN "ChannelReadReceipt" r
      ON r."userId" = ${userId}
      AND r."channelId" = mm."channelId"
    WHERE mm."userId" = ${userId}
      AND mm."roomId" = ANY(${roomIds})
      AND m."senderId" != ${userId}
      AND m."isDeleted" = false
      AND (
        r."lastReadMessageCreatedAt" IS NULL
        OR m."createdAt" > r."lastReadMessageCreatedAt"
      )
    GROUP BY mm."channelId", mm."roomId"
  `;

  return roomIds.map((roomId) => {
    const channels: Record<string, ChannelUnreadState> = {};
    for (const row of unreadRows) {
      if (row.roomId !== roomId) continue;
      channels[row.channelId] = {
        unreadCount: row.count,
        mentionCount: 0,
      };
    }
    for (const row of mentionRows) {
      if (row.roomId !== roomId) continue;
      const existing = channels[row.channelId] ?? {
        unreadCount: 0,
        mentionCount: 0,
      };
      channels[row.channelId] = {
        unreadCount: existing.unreadCount,
        mentionCount: row.count,
      };
    }
    return { roomId, channels };
  });
}

/**
 * Per-channel unread + mention counts for a single channel (used by the
 * per-channel mark-read path and room detail loads).
 */
export async function getChannelUnreadState(
  userId: string,
  channelId: string,
): Promise<ChannelUnreadState> {
  const receipt = await prisma.channelReadReceipt.findUnique({
    where: { userId_channelId: { userId, channelId } },
    select: { lastReadMessageCreatedAt: true },
  });
  const after = receipt?.lastReadMessageCreatedAt ?? undefined;
  const cursor = after ? { gt: after } : undefined;

  const [unreadCount, mentionCount] = await Promise.all([
    prisma.message.count({
      where: {
        channelId,
        senderId: { not: userId },
        isDeleted: false,
        ...(cursor ? { createdAt: cursor } : {}),
      },
    }),
    prisma.messageMention.count({
      where: {
        userId,
        channelId,
        Message: {
          senderId: { not: userId },
          isDeleted: false,
          ...(cursor ? { createdAt: cursor } : {}),
        },
      },
    }),
  ]);

  return { unreadCount, mentionCount };
}
