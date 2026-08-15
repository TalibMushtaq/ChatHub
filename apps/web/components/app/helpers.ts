// Pure formatting/derivation helpers used across the app shell. Kept free of
// React so every panel can import them without pulling in a component tree.

import type { PresenceInfo, ReadReceipt } from "./types";

export type ConvKind = "dm" | "room";

/**
 * Turn a stored avatar S3 key into a browser-loadable URL served by the
 * server's GET /api/avatars proxy. Full URLs (e.g. presigned S3 links from
 * the defaults picker) pass through untouched.
 */
export function avatarUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (!key.startsWith("defaults/") && !key.startsWith("avatars/")) return key;
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3100/api";
  return `${base}/avatars?key=${encodeURIComponent(key)}`;
}

/** Deterministic hue from a string so each user/room gets a stable color. */
export function hueOf(name: string): number {
  let n = 0;
  for (let i = 0; i < name.length; i++) n += name.charCodeAt(i);
  return n % 360;
}

/** Two-letter avatar initials, uppercased. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (
    parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)
  ).toUpperCase();
}

/** Display name fallback chain used everywhere a user is rendered. */
export function displayName(
  u:
    | { displayName?: string | null; username?: string | null }
    | null
    | undefined,
): string {
  return u?.displayName || u?.username || "Unknown";
}

/** Clock time, e.g. "09:41 PM". */
export function fmtTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "Today" / "Yesterday" / weekday — used in the thread header. */
export function fmtDay(iso: string | Date): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short" });
}

/** Compact relative time for list rows: "now", "5m", "2h", "3d", else date. */
export function fmtList(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return "now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });
}

/** Human-readable file size. */
export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Short label for a MIME type, used in attachment chips. */
export function typeLabel(mime: string | undefined): string {
  if (!mime) return "file";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

/**
 * Merge a `presence:changed` payload into the client's presence map,
 * replacing any prior entry for that user. Purely functional so the AppShell
 * socket handler can stay a one-liner and the merge rule is unit-testable.
 */
export function mergePresence(
  prev: Record<string, PresenceInfo>,
  next: PresenceInfo,
): Record<string, PresenceInfo> {
  return { ...prev, [next.userId]: next };
}

export type ReadStatus =
  "pending" | "failed" | "sent" | "read" | "readSome" | "readAll";

/**
 * Derive a message's delivery state from the participants' read cursors.
 *
 * - pending/failed are optimistic-send markers, not server state.
 * - A message is "read" (DM) when the other participant's cursor passed it.
 * - In a room it's "readAll" only when every other member's cursor passed it;
 *   a partial set yields "readSome" (rendered with a muted tick + tooltip).
 * - "sent" means nobody has read it yet.
 */
export function readStatusOf(
  m: { pending?: boolean; failed?: boolean; createdAt: string },
  mineId: string,
  receipts: ReadReceipt[],
  isRoom: boolean,
): ReadStatus {
  if (m.pending) return "pending";
  if (m.failed) return "failed";
  const ts = new Date(m.createdAt).getTime();
  const others = receipts.filter((r) => r.userId !== mineId);
  if (others.length === 0) return "sent";
  const readCount = others.filter(
    (r) => new Date(r.lastReadMessageCreatedAt).getTime() >= ts,
  ).length;
  if (readCount === 0) return "sent";
  if (isRoom) return readCount >= others.length ? "readAll" : "readSome";
  return "read";
}
