"use client";

// Client-side notification manager for ChatHubby.
//
// Owns the *push* surface (permission + Web Push subscription + service worker
// registration) as a singleton. Decisions about what an incoming message
// produces (sound vs desktop notification vs both) live in
// incomingNotifications.ts; this module supplies it with push state and the
// in-page Notification fallback never fires here directly. The notification
// preference (chathubby:desktopNotifications) is deliberately independent of
// the sound preference (chathubby:notificationSounds) and of the browser
// permission.
//
// Notification routing when a new message arrives:
// - A push subscription is active (pushReady) -> the service worker owns
//   display (it suppresses when a visible tab is viewing the conversation,
//   shows an OS notification otherwise, and asks the client to play the sound).
// - No push subscription -> the socket only delivers messages for the ACTIVE
//   conversation, so the in-page Notification fallback in
//   incomingNotifications.ts fires only when the tab is hidden.

import { ChatAPI } from "./api";
import type { ConvKind } from "./state";

export const NOTIFICATION_PREF_KEY = "chathubby:desktopNotifications";

const SW_URL = "/sw.js";

// Latest active push subscription, resolved during init. `pushReady` is the
// combined flag the message path checks.
let activeSubscription: PushSubscription | null = null;
let registration: ServiceWorkerRegistration | null = null;
let initPromise: Promise<void> | null = null;
let checking = false;

type Listener = () => void;
const listeners = new Set<Listener>();
function emit() {
  for (const l of listeners) l();
}
function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// Support & preference
// ---------------------------------------------------------------------------

/** Web Push needs a secure context, service workers, and the Notifications API. */
export function notificationsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function readPref(): boolean {
  try {
    return localStorage.getItem(NOTIFICATION_PREF_KEY) !== "0";
  } catch {
    return false;
  }
}

function writePref(on: boolean) {
  try {
    localStorage.setItem(NOTIFICATION_PREF_KEY, on ? "1" : "0");
  } catch {
    // localStorage unavailable (private mode) — the pref just won't persist.
  }
}

/** Whether the user opted into desktop notifications (read by the pipeline). */
export function notificationPrefEnabled(): boolean {
  return readPref();
}

export function notificationPermission():
  NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

export function isPushReady(): boolean {
  return notificationsSupported() && readPref() && activeSubscription !== null;
}

// ---------------------------------------------------------------------------
// Service worker plumbing
// ---------------------------------------------------------------------------

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64url = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64url);
  // Explicitly ArrayBuffer-backed: pushManager.subscribe requires a
  // BufferSource<ArrayBuffer>, and Uint8Array<ArrayBufferLike> (the default
  // annotation) is rejected by its types.
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (registration) return registration;
  if (!notificationsSupported()) return null;
  try {
    registration = await navigator.serviceWorker.register(SW_URL);
  } catch {
    registration = null;
  }
  return registration;
}

function postToServiceWorker(msg: Record<string, unknown>) {
  const controller = navigator.serviceWorker?.controller;
  if (controller) {
    controller.postMessage(msg);
    return;
  }
  // Before the SW takes control (first visit) the registration's active
  // worker still receives messages once installed.
  registration?.active?.postMessage(msg);
}

// ---------------------------------------------------------------------------
// Init (idempotent)
// ---------------------------------------------------------------------------

/**
 * Registers the service worker and learns whether a push subscription already
 * exists. Called from the app shell on mount and from the settings modal.
 */
export function ensureNotificationsInitialized(): Promise<void> {
  if (initPromise) {
    // Late callers (e.g. the settings modal opening after app init already
    // finished) would otherwise never hear about the completed init — emit
    // once more so they pick up the current snapshot.
    void initPromise.then(() => {
      checking = false;
      emit();
    });
    return initPromise;
  }

  initPromise = (async () => {
    if (!notificationsSupported()) {
      checking = false;
      emit();
      return;
    }
    checking = true;
    emit();

    const reg = await ensureRegistration();
    if (reg) {
      try {
        activeSubscription = await reg.pushManager.getSubscription();
      } catch {
        activeSubscription = null;
      }
    }
    checking = false;
    emit();
  })();

  return initPromise;
}

// ---------------------------------------------------------------------------
// Active-conversation tracking (tells the SW what's on screen)
// ---------------------------------------------------------------------------

export function setActiveConversation(kind: ConvKind, conversationId: string) {
  postToServiceWorker({
    type: "chathubby:set-active",
    kind,
    conversationId,
  });
}

export function clearActiveConversation() {
  postToServiceWorker({ type: "chathubby:clear-active" });
}

// ---------------------------------------------------------------------------
// Subscribe / unsubscribe
// ---------------------------------------------------------------------------

export type PushEnableResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "unconfigured" | "denied" | "error" };

export async function subscribeForPush(): Promise<PushEnableResult> {
  if (!notificationsSupported()) return { ok: false, reason: "unsupported" };

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return { ok: false, reason: "unconfigured" };

  // Permission must be requested from a user gesture (the settings toggle).
  if (Notification.permission === "denied") {
    return { ok: false, reason: "denied" };
  }
  if (Notification.permission === "default") {
    const result = await Notification.requestPermission();
    if (result !== "granted") return { ok: false, reason: "denied" };
  }

  try {
    const reg = await ensureRegistration();
    if (!reg) return { ok: false, reason: "unsupported" };

    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));

    const json = sub.toJSON();
    await ChatAPI.subscribePush({
      endpoint: sub.endpoint,
      keys: {
        p256dh: (json.keys?.p256dh ?? "") as string,
        auth: (json.keys?.auth ?? "") as string,
      },
    });

    activeSubscription = sub;
    writePref(true);
    emit();
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Remove the push subscription from the browser AND the server. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!notificationsSupported()) return;

  const sub = activeSubscription;
  if (sub) {
    // Tell the server first so no further pushes target a subscription we're
    // about to drop; then drop the browser-side subscription.
    await ChatAPI.unsubscribePush(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }

  activeSubscription = null;
  writePref(false);
  emit();
}

// ---------------------------------------------------------------------------
// Reactive state for the settings modal
// ---------------------------------------------------------------------------

export interface NotificationsState {
  supported: boolean;
  checking: boolean;
  prefEnabled: boolean;
  pushReady: boolean;
}

export function getNotificationsState(): NotificationsState {
  return {
    supported: notificationsSupported(),
    checking,
    prefEnabled: readPref(),
    pushReady: isPushReady(),
  };
}

export function subscribeNotifications(listener: Listener): () => void {
  return subscribe(listener);
}
