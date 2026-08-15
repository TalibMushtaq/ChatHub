// Single source of truth for manual-status colors. Every surface that renders
// a user's availability indicator (status picker, avatar dot, thread header)
// derives its tone here so a given status always maps to the same color.
//
// Tones map to the app's Tailwind color tokens (success/warn/danger/muted) —
// never hardcoded hex — so they follow the active light/dark theme.

import type { PresenceInfo, UserStatus } from "./types";

export type StatusTone = "success" | "warn" | "danger" | "muted";

export const STATUS_OPTIONS: {
  value: UserStatus;
  label: string;
  tone: StatusTone;
}[] = [
  { value: "AVAILABLE", label: "Available", tone: "success" },
  { value: "BUSY", label: "Busy", tone: "danger" },
  { value: "DND", label: "Do not disturb", tone: "danger" },
  { value: "AWAY", label: "Away", tone: "warn" },
  { value: "INVISIBLE", label: "Invisible", tone: "muted" },
];

export const STATUS_TONES: Record<UserStatus, StatusTone> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.tone]),
) as Record<UserStatus, StatusTone>;

export const STATUS_LABELS: Record<UserStatus, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label]),
) as Record<UserStatus, string>;

/** Tailwind background classes keyed by tone (literal strings so Tailwind
    keeps them in the build — dynamic `bg-${tone}` would be purged). */
export const TONE_BG: Record<StatusTone, string> = {
  success: "bg-success",
  warn: "bg-warn",
  danger: "bg-danger",
  muted: "bg-muted",
};

/**
 * The indicator tone for a live presence payload. Offline always wins (a
 * disconnected user is gray even if they left a manual status set — the
 * server's disconnect broadcast carries the last status). Otherwise the manual
 * status takes precedence over the raw presence: e.g. Online + DND renders
 * red, not green. INVISIBLE renders muted (gray) to others and self.
 */
export function presenceTone(p: PresenceInfo): StatusTone {
  if (p.presence === "offline") return "muted";
  if (p.status) return STATUS_TONES[p.status];
  return p.presence === "idle" ? "warn" : "success";
}
