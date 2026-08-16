import type { MessageType } from "@prisma/client";

/**
 * Pure payload builder for Web Push notifications — no I/O so it is trivially
 * unit-testable and shared by the DM and room send paths.
 */

export const PUSH_BODY_MAX = 140;

// Non-text messages get a short label instead of raw content (there is none
// for media — the body is the filename/preview which can be long and noisy).
const GENERIC_PREVIEWS: Partial<Record<MessageType, string>> = {
  IMAGE: "[Photo]",
  VIDEO: "[Video]",
  AUDIO: "[Audio]",
  VOICE: "[Voice message]",
  FILE: "[File]",
};

export function notificationBody(input: {
  messageType?: MessageType | null;
  content?: string | null;
}): string {
  if (input.messageType && input.messageType !== "TEXT") {
    return GENERIC_PREVIEWS[input.messageType] ?? "[Attachment]";
  }
  const text = (input.content ?? "").trim();
  if (!text) return "[Message]";
  return text.length > PUSH_BODY_MAX
    ? `${text.slice(0, PUSH_BODY_MAX)}…`
    : text;
}

/**
 * The exact payload the service worker hands to showNotification().
 *
 * `data` carries the navigation target plus everything a live client needs to
 * reconstruct the notification and play the right tone after the worker
 * forwards it (the worker spreads `data` back to the client). `tag` is unique
 * per message so a burst of notifications stacks instead of silently replacing
 * each other.
 */
export function buildPushPayload(input: {
  kind: "dm" | "room";
  conversationId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  roomName?: string | null;
  messageType: MessageType | null;
  content?: string | null;
}): {
  title: string;
  body: string;
  icon: string;
  badge: string;
  tag: string;
  data: {
    kind: "dm" | "room";
    conversationId: string;
    messageId: string;
    senderId: string;
    senderName: string;
    roomName: string | null;
    messageType: MessageType | null;
    content: string | null;
  };
} {
  const title =
    input.kind === "room"
      ? `${input.senderName} in #${input.roomName ?? "room"}`
      : input.senderName;

  return {
    title,
    body: notificationBody({
      messageType: input.messageType,
      content: input.content,
    }),
    icon: "/chathubby-v2.webp",
    badge: "/chathubby-v2.webp",
    tag: `chathubby:${input.messageId}`,
    data: {
      kind: input.kind,
      conversationId: input.conversationId,
      messageId: input.messageId,
      senderId: input.senderId,
      senderName: input.senderName,
      roomName: input.roomName ?? null,
      messageType: input.messageType,
      content: input.content ?? null,
    },
  };
}
