import webpush from "web-push";
import { prisma } from "../../../db/prisma";
import { isWebPushConfigured } from "../../lib/webPush";
import { createLogger } from "../../lib/logger";
import { buildPushPayload } from "./payload";
import type { MessageType } from "@prisma/client";

const log = createLogger("push");

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushNewMessageInput {
  kind: "dm" | "room";
  /** directChatId or chatRoomId depending on kind. */
  conversationId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  messageType: MessageType;
  content?: string | null;
}

// Resolve which users should receive a notification for this message
// (everyone but the sender), plus the room name used in the title.
async function resolveRecipients(input: PushNewMessageInput): Promise<{
  userIds: string[];
  roomName?: string | null;
} | null> {
  if (input.kind === "dm") {
    const chat = await prisma.directChat.findUnique({
      where: { id: input.conversationId },
      select: { user1Id: true, user2Id: true },
    });
    if (!chat) return null;
    const recipientId =
      chat.user1Id === input.senderId ? chat.user2Id : chat.user1Id;
    return { userIds: recipientId ? [recipientId] : [] };
  }

  const members = await prisma.chatRoomMember.findMany({
    where: { chatRoomId: input.conversationId },
    select: { userId: true, ChatRoom: { select: { name: true } } },
  });
  return {
    userIds: members
      .map((m) => m.userId)
      .filter((id) => id !== input.senderId),
    roomName: members[0]?.ChatRoom?.name ?? null,
  };
}

// A 404/410 means the subscription is dead (browser unsubscribed or the
// push service expired it) — prune it so we stop wasting sends on it.
function isGoneSubscription(err: unknown): boolean {
  const status = (err as { statusCode?: number })?.statusCode;
  return status === 404 || status === 410;
}

/**
 * Fire-and-forget Web Push for a newly created message.
 *
 * Deliberately never throws: notifications are a secondary side-effect, so a
 * push failure must never fail the message send the user already saw succeed.
 * Each subscription is sent in its own try/catch so one dead subscription
 * can't block the rest.
 */
export async function pushNewMessage(input: PushNewMessageInput): Promise<void> {
  if (!isWebPushConfigured()) return;
  // SYSTEM messages are server-generated status lines; don't alert on them.
  if (input.messageType === "SYSTEM") return;

  try {
    const recipients = await resolveRecipients(input);
    if (!recipients || recipients.userIds.length === 0) return;

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: { in: recipients.userIds } },
    });
    if (subscriptions.length === 0) return;

    const payload = JSON.stringify(
      buildPushPayload({
        kind: input.kind,
        conversationId: input.conversationId,
        messageId: input.messageId,
        senderName: input.senderName,
        roomName: recipients.roomName ?? null,
        messageType: input.messageType,
        content: input.content,
      }),
    );

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
          );
        } catch (err) {
          if (isGoneSubscription(err)) {
            // Best-effort prune: a missing row on the next send is fine.
            await prisma.pushSubscription
              .deleteMany({ where: { endpoint: sub.endpoint } })
              .catch(() => {});
          } else {
            log.warn("web push send failed", { endpoint: sub.endpoint });
          }
        }
      }),
    );
  } catch (err) {
    log.error("pushNewMessage failed", err, {
      kind: input.kind,
      conversationId: input.conversationId,
    });
  }
}

/** Create or refresh a browser's push subscription for a user. */
export async function upsertPushSubscription(
  userId: string,
  endpoint: string,
  keys: PushSubscriptionKeys,
): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId, p256dh: keys.p256dh, auth: keys.auth },
  });
}

/**
 * Remove a subscription. Scoped to the caller's userId so a user can never
 * delete another user's subscription even with a valid endpoint.
 */
export async function deletePushSubscription(
  userId: string,
  endpoint: string,
): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}
