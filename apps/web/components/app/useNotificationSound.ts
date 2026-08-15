"use client";

// Central notification-sound manager for incoming messages. Both Audio
// elements and the per-message seen-set live here so no component ever builds
// its own sound logic and a message can never be replayed by a re-render or a
// duplicate socket event. The on/off preference is stored in localStorage so
// the settings modal and playback path share one source of truth.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConvKind } from "./state";

export const NOTIFICATION_SOUND_STORAGE_KEY = "chathubby:notificationSounds";

const SOUND_URLS: Record<ConvKind, string> = {
  dm: "/sounds/dm_sound.mp3",
  room: "/sounds/group_sound.mp3",
};

export function useNotificationSound() {
  const [soundEnabled, setSoundEnabled] = useState(true);
  // `enabledRef` mirrors the state so the stable `play` callback never captures
  // a stale value (the AppShell socket handlers are registered only once).
  const enabledRef = useRef(true);
  // One Audio per conversation kind, created lazily on first playback.
  const audioRef = useRef<Partial<Record<ConvKind, HTMLAudioElement>>>({});
  // IDs of messages that already triggered a sound; guards against duplicate
  // delivery and any re-render/replay path.
  const playedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const saved = localStorage.getItem(NOTIFICATION_SOUND_STORAGE_KEY);
    const enabled = saved !== "0";
    enabledRef.current = enabled;
    setSoundEnabled(enabled);
  }, []);

  const toggleSoundEnabled = useCallback((enabled: boolean) => {
    enabledRef.current = enabled;
    setSoundEnabled(enabled);
    localStorage.setItem(NOTIFICATION_SOUND_STORAGE_KEY, enabled ? "1" : "0");
  }, []);

  const play = useCallback((messageId: string, kind: ConvKind) => {
    if (!enabledRef.current) return;
    if (playedRef.current.has(messageId)) return;
    playedRef.current.add(messageId);
    const audio = (audioRef.current[kind] ??= new Audio(SOUND_URLS[kind]));
    // Restart so a burst of messages is still audible rather than clipped.
    audio.currentTime = 0;
    // Autoplay policy (no prior user gesture) rejects play(); swallow the
    // rejection so a blocked sound can never break message processing.
    void audio.play().catch(() => {});
  }, []);

  return { play, soundEnabled, setSoundEnabled: toggleSoundEnabled };
}
