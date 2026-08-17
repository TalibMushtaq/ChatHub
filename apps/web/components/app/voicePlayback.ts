"use client";

// Global voice playback controller.
//
// A single module-level <Audio> element is shared by every VoiceMessagePlayer
// in the app, so starting playback on one message automatically stops whatever
// was playing before — no per-component state can drift into two sounds at
// once. Components subscribe via useSyncExternalStore; the element's events
// are the only writers of the shared state.
import { useSyncExternalStore } from "react";

export interface VoicePlaybackState {
  /** attachmentId of the audio currently loaded (or null). */
  currentId: string | null;
  playing: boolean;
  loading: boolean;
  error: boolean;
  currentTime: number;
  duration: number;
}

const INITIAL: VoicePlaybackState = {
  currentId: null,
  playing: false,
  loading: false,
  error: false,
  currentTime: 0,
  duration: 0,
};

// Guarded so importing this module during SSR doesn't construct an Audio
// element in a Node context; the client-only call sites run after hydration.
const audio: HTMLAudioElement | null =
  typeof window !== "undefined" ? new Audio() : null;

let state: VoicePlaybackState = INITIAL;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function patch(next: Partial<VoicePlaybackState>) {
  state = { ...state, ...next };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): VoicePlaybackState {
  return state;
}

if (audio) {
  audio.preload = "metadata";
  audio.addEventListener("play", () =>
    patch({ playing: true, loading: false, error: false }),
  );
  audio.addEventListener("pause", () =>
    patch({ playing: false, loading: false }),
  );
  audio.addEventListener("ended", () =>
    patch({ playing: false, currentTime: 0 }),
  );
  audio.addEventListener("timeupdate", () =>
    patch({ currentTime: audio.currentTime }),
  );
  audio.addEventListener("loadedmetadata", () =>
    patch({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 }),
  );
  audio.addEventListener("waiting", () => patch({ loading: true }));
  audio.addEventListener("canplay", () => patch({ loading: false }));
  audio.addEventListener("error", () => patch({ error: true, loading: false }));
}

/** Point the shared element at a new attachment, clearing previous playback. */
function load(id: string, url: string) {
  if (state.currentId === id) return;
  audio!.src = url;
  audio!.load();
  patch({
    currentId: id,
    currentTime: 0,
    duration: 0,
    playing: false,
    loading: true,
    error: false,
  });
}

/** Play/pause a specific attachment; switching sources stops any other one. */
export function toggleVoicePlayback(id: string, url: string) {
  if (!audio) return;
  if (state.currentId === id) {
    if (audio.paused) {
      void audio.play().catch(() => patch({ error: true, loading: false }));
    } else {
      audio.pause();
    }
    return;
  }
  load(id, url);
  void audio.play().catch(() => patch({ error: true, loading: false }));
}

/** Seek the currently-loaded attachment (no-op if it isn't loaded). */
export function seekVoicePlayback(time: number) {
  if (!audio || !state.currentId) return;
  audio.currentTime = time;
  patch({ currentTime: time });
}

export function useVoicePlayback(attachmentId: string, url: string) {
  const s = useSyncExternalStore(subscribe, getSnapshot);
  const isCurrent = s.currentId === attachmentId;
  return {
    playing: isCurrent && s.playing,
    loading: isCurrent && s.loading,
    error: isCurrent && s.error,
    currentTime: isCurrent ? s.currentTime : 0,
    duration: isCurrent && s.duration > 0 ? s.duration : 0,
    toggle: () => toggleVoicePlayback(attachmentId, url),
    seek: (t: number) => seekVoicePlayback(t),
  };
}
