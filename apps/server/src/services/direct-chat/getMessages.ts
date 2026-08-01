import { prisma } from "../../../db/prisma";
import {
  messageWithUserSelect,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../../constants/direct-chat";

/**
 * Load messages for a direct chat with optional cursor pagination.
 *
 * Legacy behavior (no cursor):
 *   - Returns the first N messages in ascending order.
 *   - nextCursor is null.
 *
 * Cursor pagination (direction=before):
 *   - Returns N messages immediately before the cursor, ascending.
 *   - nextCursor is the oldest message id in the returned batch (or null if empty).
 *
 * Uses the existing @@index([directChatId, createdAt]) efficiently.
 */
export async function getMessages(
  directChatId: string,
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
      where: { directChatId },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: messageWithUserSelect,
    });
    return { messages, nextCursor: null as string | null };
  }

  if (hasCursor && isBefore) {
    const cursor = options.cursor!;
    // Negative take with ascending orderBy returns N records *before* the
    // cursor while keeping them in chronological order. This uses the existing
    // @@index([directChatId, createdAt]) for an index-seek instead of a scan.
    const messages = await prisma.message.findMany({
      where: { directChatId },
      orderBy: { createdAt: "asc" },
      skip: 1,
      cursor: { id: cursor },
      take: -limit,
      select: messageWithUserSelect,
    });
    return {
      messages,
      nextCursor: messages.length > 0 ? messages[0]!.id : null,
    };
  }

  // Unsupported direction — fall back to legacy behavior
  const messages = await prisma.message.findMany({
    where: { directChatId },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: messageWithUserSelect,
  });
  return { messages, nextCursor: null };
}
