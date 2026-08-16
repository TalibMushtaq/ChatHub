"use client";

// Central notification-sound engine for incoming messages, held at module
// scope so the notification pipeline (incomingNotifications.ts) can drive
// playback without routing through React. The hook below is kept as the
// settings modal's reactive surface over the same module state, so the on/off
// preference (chathubby:notificationSounds) and the playback path always share
// one source of truth.
//
// The per-message seen-set lives here (not only in the pipeline's dedupe) as a
// defense-in-depth guard: whatever calls playNotificationSound, a message can
// never produce two sounds in one browser client.
import { useCallback, useEffect, useState } from "react";
import type { ConvKind } from "./state";

export const NOTIFICATION_SOUND_STORAGE_KEY = "chathubby:notificationSounds";

const SOUND_URLS: Record<ConvKind, string> = {
  dm: "/sounds/dm_sound.mp3",
  room: "/sounds/group_sound.mp3",
};

// One Audio per conversation kind, created lazily on first playback so the
// app never instantiates more than two audio elements.
const audios: Partial<Record<ConvKind, HTMLAudioElement>> = {};

// IDs of messages that already triggered a sound; guards against duplicate
// delivery and any re-render/replay path.
const playedIds = new Set<string>();
const PLAYED_LIMIT = 200;

function readEnabled(): boolean {
  try {
    return localStorage.getItem(NOTIFICATION_SOUND_STORAGE_KEY) !== "0";
  } catch {
    // localStorage unavailable (SSR/private mode) — default to on, matching
    // the hook's initial state until the effect syncs the real value.
    return true;
  }
}

let soundEnabled = readEnabled();

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

export function isNotificationSoundEnabled(): boolean {
  return soundEnabled;
}

/** Persist the preference immediately so it applies the moment it flips. */
export function setNotificationSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
  try {
    localStorage.setItem(NOTIFICATION_SOUND_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // localStorage unavailable (private mode) — the pref just won't persist.
  }
  emit();
}

export function playNotificationSound(messageId: string, kind: ConvKind): void {
  if (!soundEnabled) return;
  if (playedIds.has(messageId)) return;
  playedIds.add(messageId);
  while (playedIds.size > PLAYED_LIMIT) {
    const oldest = playedIds.values().next().value;
    if (oldest !== undefined) playedIds.delete(oldest);
  }
  const audio = (audios[kind] ??= new Audio(SOUND_URLS[kind]));
  // Restart so a burst of messages is still audible rather than clipped.
  audio.currentTime = 0;
  // Autoplay policy (no prior user gesture) rejects play(); swallow the
  // rejection so a blocked sound can never break message processing.
  void audio.play().catch(() => {});
}

/** React surface for the settings modal; mirrors the module-level engine. */
export function useNotificationSound() {
  const [soundEnabledState, setSoundEnabledState] = useState(true);

  useEffect(() => {
    const sync = () => setSoundEnabledState(isNotificationSoundEnabled());
    sync();
    return subscribe(sync);
  }, []);

  const setSoundEnabled = useCallback((enabled: boolean) => {
    setNotificationSoundEnabled(enabled);
    setSoundEnabledState(enabled);
  }, []);

  return {
    play: playNotificationSound,
    soundEnabled: soundEnabledState,
    setSoundEnabled,
  };
}
