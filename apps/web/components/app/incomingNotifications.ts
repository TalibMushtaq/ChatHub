"use client";

// Single "incoming message notification" pipeline for the app. Both delivery
// channels converge here:
//   - socket events (AppShell's onNew) for the conversation the tab joined, and
//   - service-worker "chathubby:incoming-message" posts sent when a Web Push
//     landed and the worker couldn't see that conversation on screen.
// The handler decides sound + desktop notification together and dedupes by
// messageId across both channels, so whichever delivery arrives first wins and
// a message can never produce two sounds in this browser client.
//
// Notification display semantics are unchanged: with an active push
// subscription the service worker owns OS display (this handler only plays the
// sound, since the worker already showed/suppressed the notification); without
// one, the in-page Notification fallback fires only when the tab is hidden,
// exactly like the old notifyIncomingMessage.
import {
  isPushReady,
  notificationPrefEnabled,
  notificationsSupported,
} from "./notifications";
import { playNotificationSound } from "./useNotificationSound";
import type { ConvKind } from "./state";

export type NotificationSource = "socket" | "push";

export interface IncomingMessageNotificationInput {
  source: NotificationSource;
  kind: ConvKind;
  conversationId: string;
  messageId: string;
  senderId?: string | null;
  senderName: string;
  roomName?: string | null;
  messageType?: string | null;
  content?: string | null;
}

// messageIds already processed by this pipeline. Shared by the socket and
// service-worker paths (see handleIncomingMessageNotification).
const seenIds = new Set<string>();
const SEEN_LIMIT = 200;

// Signed-in user id, registered by AppShell once the profile loads. Lets the
// handler reject self-sent messages on its own rather than trusting callers to
// have pre-filtered them (the socket path already pre-checks "mine").
let currentUserId: string | null = null;

export function setNotificationUserId(userId: string | null): void {
  currentUserId = userId;
}

function rememberSeen(messageId: string) {
  seenIds.add(messageId);
  while (seenIds.size > SEEN_LIMIT) {
    const oldest = seenIds.values().next().value;
    if (oldest !== undefined) seenIds.delete(oldest);
  }
}

/**
 * In-page Notification fallback for socket-delivered messages. Mirrors the
 * previous notifyIncomingMessage exactly: only when no push subscription owns
 * display AND the tab is hidden (a visible tab is already rendering the
 * message). Never requests permission — the settings toggle owns that gesture.
 */
function maybeShowInPageNotification(input: IncomingMessageNotificationInput) {
  if (!notificationsSupported()) return;
  if (!notificationPrefEnabled()) return;
  if (isPushReady()) return;
  if (
    typeof document !== "undefined" &&
    document.visibilityState === "visible"
  ) {
    return;
  }

  const title =
    input.kind === "room"
      ? `${input.senderName} in #${input.roomName ?? "room"}`
      : input.senderName;
  const body =
    input.messageType && input.messageType !== "TEXT"
      ? "[Message]"
      : (input.content ?? "[Message]").trim() || "[Message]";

  try {
    const n = new Notification(title, {
      body,
      icon: "/chathubby-v2.webp",
      badge: "/chathubby-v2.webp",
      tag: `chathubby:${input.messageId}`,
      data: {
        kind: input.kind,
        conversationId: input.conversationId,
        messageId: input.messageId,
      },
    });
    n.onclick = () => {
      window.focus();
      window.location.href = `/dashboard?conv=${input.kind}:${input.conversationId}`;
    };
  } catch {
    // Notification constructors can throw when the OS refuses; never break
    // message processing because of it.
  }
}

/**
 * Central decision point for a non-self incoming message. Returns early for
 * self-sent or already-seen messages; otherwise plays the DM/group sound and,
 * for socket-delivered messages, may show the in-page Notification fallback.
 */
export function handleIncomingMessageNotification(
  input: IncomingMessageNotificationInput,
): void {
  if (input.senderId && currentUserId && input.senderId === currentUserId) {
    return;
  }
  if (seenIds.has(input.messageId)) return;
  rememberSeen(input.messageId);

  playNotificationSound(input.messageId, input.kind);

  // Web Push messages: the service worker already showed (or suppressed) the
  // OS notification, so the client must not show a second one.
  if (input.source === "push") return;
  maybeShowInPageNotification(input);
}
