import { prisma } from "../../../db/prisma";
import {
  roomMessageWithUserSelect,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../../constants/room";

/**
 * Load messages for a chat room with optional cursor pagination.
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
 * Uses the existing @@index([chatRoomId, createdAt]) efficiently.
 */
export async function getMessages(
  chatRoomId: string,
  options: {
    cursor?: string;
    limit?: number;
    direction?: "before";
  },
) {
  const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const hasCursor = !!options.cursor;
  const isBefore = options.direction === "before";

  if (!hasCursor) {
    const messages = await prisma.message.findMany({
      where: { chatRoomId },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: roomMessageWithUserSelect,
    });
    return { messages, nextCursor: null as string | null };
  }

  if (hasCursor && isBefore) {
    const cursor = options.cursor!;
    // Negative take with ascending orderBy returns N records *before* the
    // cursor while keeping them in chronological order. This uses the existing
    // @@index([chatRoomId, createdAt]) for an index-seek instead of a scan.
    const messages = await prisma.message.findMany({
      where: { chatRoomId },
      orderBy: { createdAt: "asc" },
      skip: 1,
      cursor: { id: cursor },
      take: -limit,
      select: roomMessageWithUserSelect,
    });
    return {
      messages,
      nextCursor: messages.length > 0 ? messages[0]!.id : null,
    };
  }

  // Unsupported direction — fall back to legacy behavior
  const messages = await prisma.message.findMany({
    where: { chatRoomId },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: roomMessageWithUserSelect,
  });
  return { messages, nextCursor: null };
}
