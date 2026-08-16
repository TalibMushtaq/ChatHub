// Service worker for ChatHubby — powers Web Push OS notifications.
//
// Responsibilities:
// 1. Show an OS notification for an incoming push, UNLESS a visible ChatHubby
//    tab is already showing that exact conversation (the socket in that tab
//    renders the message live, so a notification would be redundant).
// 2. Deduplicate by message id: the socket and the push channel can deliver
//    the same message, and the server replays idempotent pushes.
// 3. Turn a click into navigation to the right conversation (focus + tell the
//    client, or open /dashboard?conv=<kind>:<id>).

"use strict";

// Message ids recently shown (or suppressed). Bounded so a long-lived worker
// never grows it without limit.
const recentMessageIds = new Set();
const RECENT_LIMIT = 200;

// clientId -> { kind, conversationId }. The app posts its active conversation
// whenever it changes; used to suppress notifications for what's on screen.
const activeConvs = new Map();

function rememberMessage(messageId) {
  recentMessageIds.add(messageId);
  while (recentMessageIds.size > RECENT_LIMIT) {
    recentMessageIds.delete(recentMessageIds.values().next().value);
  }
}

// The app keeps the worker up to date about what each tab is viewing.
function handleMessage(event) {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "chathubby:set-active") {
    if (msg.conversationId) {
      activeConvs.set(event.source.id, {
        kind: msg.kind === "room" ? "room" : "dm",
        conversationId: msg.conversationId,
      });
    } else {
      activeConvs.delete(event.source.id);
    }
  } else if (msg.type === "chathubby:clear-active") {
    activeConvs.delete(event.source.id);
  }
}

function isViewing(client, data) {
  const conv = activeConvs.get(client.id);
  return (
    conv != null &&
    data != null &&
    conv.kind === data.kind &&
    conv.conversationId === data.conversationId
  );
}

self.addEventListener("message", handleMessage);

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // Malformed payload — nothing useful to show.
    return;
  }

  const data = (payload && payload.data) || {};
  const isFriendRequest = data.kind === "friend-request";

  // Messages dedupe by message id; friend-request events share the request id
  // but live in a different id space, so namespace the key to avoid colliding
  // with a message id.
  const dedupeKey = isFriendRequest
    ? `friend-request:${data.requestId}`
    : data.messageId;

  if (dedupeKey) {
    // Duplicate delivery (socket echo + push) — swallow the second copy.
    if (recentMessageIds.has(dedupeKey)) return;
    rememberMessage(dedupeKey);
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // A visible tab already showing this conversation renders the message
        // live, so an OS notification would be redundant. Friend requests have
        // no conversation to be viewing, so they always show.
        const redundant =
          !isFriendRequest &&
          clients.some(
            (client) =>
              client.visibilityState === "visible" && isViewing(client, data),
          );
        if (!redundant) {
          self.registration.showNotification(payload.title, {
            body: payload.body,
            icon: payload.icon,
            badge: payload.badge,
            tag: payload.tag,
            data,
          });
        }

        // Ask clients to apply the event: messages that are NOT already
        // showing the conversation play the tone and may update the timeline;
        // friend-request events update the inbox cards / relationship chips.
        // The client dedupes by request id, so a parallel socket delivery
        // can't double-fire.
        for (const client of clients) {
          if (isFriendRequest) {
            client.postMessage({
              type: "chathubby:incoming-friend-request",
              ...data,
            });
          } else if (!isViewing(client, data)) {
            client.postMessage({
              type: "chathubby:incoming-message",
              ...data,
            });
          }
        }
      }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = (event.notification.data && event.notification.data) || {};

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Prefer focusing an existing window and letting the app navigate —
        // this keeps the full shell (rail, lists, socket) alive.
        for (const client of clients) {
          if ("focus" in client) {
            client.postMessage({ type: "chathubby:navigate", ...data });
            return client.focus();
          }
        }

        // No open window — boot the app straight into the conversation.
        const query = data.conversationId
          ? `?conv=${data.kind}:${data.conversationId}`
          : "";
        return self.clients.openWindow(`/dashboard${query}`);
      }),
  );
});
