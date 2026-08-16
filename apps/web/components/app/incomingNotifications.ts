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

// ---------------------------------------------------------------------------
// Friend-request notifications
// ---------------------------------------------------------------------------

export type FriendRequestEvent = "new" | "accepted" | "declined" | "blocked";

export interface IncomingFriendRequestNotificationInput {
  source: NotificationSource;
  event: FriendRequestEvent;
  requestId: string;
  fromId: string;
  fromName: string;
}

// Request ids already processed by this pipeline, deduped across the socket
// and service-worker push paths (the server emits both for the same event, and
// the SW forwards pushes it shows) so one event can never sound twice.
const seenFriendRequestIds = new Set<string>();

const FRIEND_REQUEST_BODY: Record<FriendRequestEvent, string> = {
  new: "sent you a friend request",
  accepted: "accepted your friend request",
  declined: "declined your friend request",
  blocked: "blocked you",
};

/**
 * In-page Notification fallback for friend-request events, mirroring the
 * message path: only when no push subscription owns display AND the tab is
 * hidden. Never requests permission — the settings toggle owns that gesture.
 */
function maybeShowFriendRequestNotification(
  input: IncomingFriendRequestNotificationInput,
) {
  if (!notificationsSupported()) return;
  if (!notificationPrefEnabled()) return;
  if (isPushReady()) return;
  if (
    typeof document !== "undefined" &&
    document.visibilityState === "visible"
  ) {
    return;
  }

  try {
    const n = new Notification(input.fromName, {
      body: FRIEND_REQUEST_BODY[input.event],
      icon: "/chathubby-v2.webp",
      badge: "/chathubby-v2.webp",
      tag: `chathubby:friend-request:${input.requestId}`,
      data: {
        kind: "friend-request",
        event: input.event,
        requestId: input.requestId,
        fromId: input.fromId,
      },
    });
    n.onclick = () => {
      window.focus();
      window.location.href = "/dashboard";
    };
  } catch {
    // Notification constructors can throw when the OS refuses; never break
    // event processing because of it.
  }
}

/**
 * Central decision point for a friend-request lifecycle event. Only "new" and
 * "accepted" are worth an audible cue (a stranger reaching out, or a friend
 * confirming); "declined" and "blocked" still land as in-page/OS notifications
 * but stay silent.
 */
export function handleIncomingFriendRequestNotification(
  input: IncomingFriendRequestNotificationInput,
): void {
  if (seenFriendRequestIds.has(input.requestId)) return;
  seenFriendRequestIds.add(input.requestId);
  while (seenFriendRequestIds.size > SEEN_LIMIT) {
    const oldest = seenFriendRequestIds.values().next().value;
    if (oldest !== undefined) seenFriendRequestIds.delete(oldest);
  }

  if (input.event === "new" || input.event === "accepted") {
    playNotificationSound(`friend-request:${input.requestId}`, "dm");
  }

  // Web Push messages: the service worker already showed (or suppressed) the
  // OS notification, so the client must not show a second one.
  if (input.source === "push") return;
  maybeShowFriendRequestNotification(input);
}
