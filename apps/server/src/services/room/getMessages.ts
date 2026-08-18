import { prisma } from "../../../db/prisma";
import {
  roomMessageWithUserSelect,
  toRoomMessagePayload,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../../constants/room";

/**
 * Load messages for a room (optionally scoped to one channel) with cursor
 * pagination.
 *
 * Mirrors the direct-chat getMessages contract so both conversation types
 * share one pagination model (the web client fetches both timelines with the
 * same query-shape).
 *
 * Legacy behavior (no cursor):
 *   - Returns the first N messages in ascending order.
 *   - nextCursor is null.
 *
 * Cursor pagination (direction=before):
 *   - Returns N messages immediately before the cursor, ascending.
 *   - nextCursor is the oldest message id in the returned batch (or null if empty).
 *
 * Uses the existing @@index([chatRoomId, createdAt]) / @@index([channelId, createdAt])
 * efficiently. Messages are mapped to the client payload (chatRoomId → roomId).
 */
export async function getMessages(
  roomId: string,
  options: {
    channelId?: string;
    cursor?: string;
    limit?: number;
    direction?: "before";
  },
) {
  const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const hasCursor = !!options.cursor;
  const isBefore = options.direction === "before";

  // Filter by channel when requested; otherwise fall back to the whole room
  // for backward compatibility during the channels transition.
  const where = {
    chatRoomId: roomId,
    ...(options.channelId ? { channelId: options.channelId } : {}),
  };

  if (!hasCursor) {
    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: limit,
      select: roomMessageWithUserSelect,
    });
    return {
      messages: messages.map(toRoomMessagePayload),
      nextCursor: null as string | null,
    };
  }

  if (hasCursor && isBefore) {
    const cursor = options.cursor!;
    // Negative take with ascending orderBy returns N records *before* the
    // cursor while keeping them in chronological order. This uses the existing
    // (chatRoomId|channelId, createdAt) index for an index-seek instead of a scan.
    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: 1,
      cursor: { id: cursor },
      take: -limit,
      select: roomMessageWithUserSelect,
    });
    return {
      messages: messages.map(toRoomMessagePayload),
      nextCursor: messages.length > 0 ? messages[0]!.id : null,
    };
  }

  // Unsupported direction — fall back to legacy behavior
  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: limit,
    select: roomMessageWithUserSelect,
  });
  return { messages: messages.map(toRoomMessagePayload), nextCursor: null };
}
