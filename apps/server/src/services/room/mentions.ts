import { prisma } from "../../../db/prisma";

/**
 * @mention detection + persistence (Phase 6 §10.1/§10.3).
 *
 * Parsing is deliberately conservative: only standalone `@username` tokens
 * (not `@` inside emails, urls, or existing words) are candidates, and a
 * mention only counts if the username belongs to a current room member other
 * than the sender. Storing mentions at write time lets the sidebar show a
 * Mentioned badge and lets MENTIONS notification prefs be honored without
 * re-parsing content on every unread computation.
 */

/** Extract candidate `@username` tokens from message content. */
export function extractMentionedUsernames(
  content: string | null | undefined,
): string[] {
  if (!content) return [];
  // Match @ followed by 3-20 word chars; require a non-word char (or start) on
  // the left so `foo@bar` (email) and `abc@def` are not treated as mentions.
  const matches = content.match(/(^|[^\w@])@([a-zA-Z0-9_]{3,20})/g) ?? [];
  const seen = new Set<string>();
  for (const m of matches) {
    const username = m.trim().slice(1);
    if (username) seen.add(username);
  }
  return [...seen];
}

/**
 * Detect mentioned room members and persist MessageMention rows for them.
 *
 * Returns the mentioned member summaries (userId + username) so the caller can
 * emit a `mention:new` socket event and route MENTIONS-only notifications.
 * Never throws on parse misses — a message with no mentions is a no-op.
 */
export async function createMessageMentions(input: {
  messageId: string;
  roomId: string;
  channelId: string;
  senderId: string;
  content: string | null | undefined;
}): Promise<{ userId: string; username: string }[]> {
  const usernames = extractMentionedUsernames(input.content);
  if (usernames.length === 0) return [];

  const members = await prisma.chatRoomMember.findMany({
    where: {
      chatRoomId: input.roomId,
      User: { username: { in: usernames } },
    },
    select: {
      userId: true,
      User: { select: { username: true } },
    },
  });

  // A user can be @-mentioned more than once, but never mentions themself.
  const targets = members.filter((m) => m.userId !== input.senderId);
  if (targets.length === 0) return [];

  await prisma.messageMention.createMany({
    data: targets.map((t) => ({
      messageId: input.messageId,
      userId: t.userId,
      roomId: input.roomId,
      channelId: input.channelId,
    })),
    skipDuplicates: true,
  });

  return targets.map((t) => ({
    userId: t.userId,
    username: t.User.username,
  }));
}
