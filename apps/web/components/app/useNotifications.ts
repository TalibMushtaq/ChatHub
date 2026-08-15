"use client";

// React wrapper around the notifications singleton so the settings modal can
// render permission/preference state reactively and toggle it with feedback.
import { useEffect, useRef, useState } from "react";
import {
  ensureNotificationsInitialized,
  getNotificationsState,
  notificationPermission,
  subscribeForPush,
  subscribeNotifications,
  type NotificationsState,
  type PushEnableResult,
  unsubscribeFromPush,
} from "./notifications";

export function useNotifications() {
  const [state, setState] = useState<NotificationsState>({
    supported: false,
    checking: false,
    prefEnabled: false,
    pushReady: false,
  });
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (!cancelled) setState(getNotificationsState());
    };
    // Subscribe before kicking off init so the async completion re-renders us.
    const unsub = subscribeNotifications(refresh);
    // Snapshot the current state immediately: init may have finished before
    // this component mounted (AppShell initializes at app load), in which case
    // the singleton only emits on *change* and we'd otherwise show stale
    // initial values (supported=false, prefEnabled=false).
    refresh();
    void ensureNotificationsInitialized().then(refresh);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  async function enable(): Promise<PushEnableResult> {
    if (busyRef.current) return { ok: false, reason: "error" };
    busyRef.current = true;
    try {
      const result = await subscribeForPush();
      setState(getNotificationsState());
      return result;
    } finally {
      busyRef.current = false;
    }
  }

  async function disable(): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await unsubscribeFromPush();
      setState(getNotificationsState());
    } finally {
      busyRef.current = false;
    }
  }

  return {
    ...state,
    permission: notificationPermission(),
    enable,
    disable,
  };
}
