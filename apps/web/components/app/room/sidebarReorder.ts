"use client";

// Pure helpers for Phase 3 sidebar reorder + channel deep links. Kept free of
// React so the drag-drop math (where a dropped channel lands, what the server
// payload should be) is unit-testable without rendering a DOM.

import type { Category, Channel, RoomDetail } from "../types";

/** Sentinel container id for channels with `categoryId: null` (Uncategorized). */
export const UNCATEGORIZED_ID = "__uncategorized";

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Which container a channel id currently lives in, or null if unknown. */
export function channelContainer(
  containers: ChannelContainers,
  channelId: string,
): string | null {
  for (const [key, ids] of Object.entries(containers)) {
    if (ids.includes(channelId)) return key;
  }
  return null;
}

/**
 * Apply one drag-over step: same-container moves become an arrayMove (the
 * dragged item takes the over item's slot); cross-container moves use
 * moveChannel. Returns the same object reference when nothing changes so
 * callers can skip pointless state updates.
 */
export function applyDragOver(
  containers: ChannelContainers,
  activeId: string,
  activeContainer: string,
  overId: string | null,
  overContainer: string,
): ChannelContainers {
  if (!activeContainer || !overContainer) return containers;
  if (activeContainer === overContainer) {
    const ids = containers[activeContainer] ?? [];
    const activeIndex = ids.indexOf(activeId);
    const overIndex = overId ? ids.indexOf(overId) : -1;
    if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
      return containers;
    }
    return {
      ...containers,
      [activeContainer]: arrayMove(ids, activeIndex, overIndex),
    };
  }
  return moveChannel(
    containers,
    activeContainer,
    overContainer,
    activeId,
    overId,
  );
}

/** categoryId (or UNCATEGORIZED_ID) -> ordered channel ids, for the DnD state. */
export type ChannelContainers = Record<string, string[]>;

/** Snap a room detail's channels into per-category ordered id buckets. */
export function channelsByCategory(detail: RoomDetail): ChannelContainers {
  const out: ChannelContainers = {};
  for (const cat of detail.categories) {
    out[cat.id] = (cat.channels ?? []).map((c) => c.id);
  }
  out[UNCATEGORIZED_ID] = detail.uncategorized.map((c) => c.id);
  return out;
}

/** Which container a channel currently lives in, or null if unknown. */
export function categoryIdOfChannel(
  detail: RoomDetail,
  channelId: string,
): string | null {
  for (const cat of detail.categories) {
    if ((cat.channels ?? []).some((c) => c.id === channelId)) return cat.id;
  }
  if (detail.uncategorized.some((c) => c.id === channelId)) {
    return UNCATEGORIZED_ID;
  }
  return null;
}

/**
 * Move `activeId` from `from` into `to`, inserting it at the target item's
 * position (arrayMove semantics — the active item takes the over item's slot).
 * `overId: null` (or not found) appends to the bucket. Returns a NEW containers
 * object so callers can compare snapshots for optimistic rollback.
 */
export function moveChannel(
  containers: ChannelContainers,
  from: string,
  to: string,
  activeId: string,
  overId: string | null,
): ChannelContainers {
  // The over index is captured against the ORIGINAL target bucket: after the
  // active item is removed, indices shift, and arrayMove splices at the
  // target's pre-removal position.
  const overIndex = overId ? (containers[to] ?? []).indexOf(overId) : -1;
  const next: ChannelContainers = {};
  for (const [key, ids] of Object.entries(containers)) {
    next[key] = key === from ? ids.filter((id) => id !== activeId) : [...ids];
  }
  const target = next[to] ?? [];
  const insertAt = Math.max(
    0,
    Math.min(overIndex < 0 ? target.length : overIndex, target.length),
  );
  target.splice(insertAt, 0, activeId);
  next[to] = target;
  return next;
}

/**
 * Build the PATCH /channels/reorder payload plus the locally-patched detail
 * that mirrors it. Channels are emitted in display order (categories in
 * position order, then uncategorized) because the server renumbers positions
 * sequentially across the whole payload.
 */
export function channelReorderResult(
  detail: RoomDetail,
  containers: ChannelContainers,
): {
  items: { id: string; categoryId: string | null }[];
  nextDetail: RoomDetail;
} {
  // Cross-category moves put channels into buckets other than their original
  // one, so channels are resolved from the whole room, not per-category.
  const channelById = new Map<string, Channel>();
  for (const cat of detail.categories) {
    for (const ch of cat.channels ?? []) channelById.set(ch.id, ch);
  }
  for (const ch of detail.uncategorized) channelById.set(ch.id, ch);
  const categories: Category[] = detail.categories.map((cat) => ({
    ...cat,
    channels: (containers[cat.id] ?? [])
      .map((id) => channelById.get(id))
      .filter((c): c is Channel => !!c),
  }));
  const uncategorized: Channel[] = (containers[UNCATEGORIZED_ID] ?? [])
    .map((id) => channelById.get(id))
    .filter((c): c is Channel => !!c);
  const nextDetail: RoomDetail = { ...detail, categories, uncategorized };

  const items: { id: string; categoryId: string | null }[] = [];
  for (const cat of categories) {
    for (const ch of cat.channels ?? []) {
      items.push({ id: ch.id, categoryId: cat.id });
    }
  }
  for (const ch of uncategorized) {
    items.push({ id: ch.id, categoryId: null });
  }
  return { items, nextDetail };
}

/**
 * Build the PATCH /categories/reorder payload + patched detail from a new
 * category order. Unknown ids are dropped so a stale client can't inject
 * foreign categories into the position list.
 */
export function categoryReorderResult(
  detail: RoomDetail,
  orderedCategoryIds: string[],
): { orderedIds: string[]; nextDetail: RoomDetail } {
  const idToCategory = new Map(detail.categories.map((c) => [c.id, c]));
  const categories = orderedCategoryIds
    .map((id) => idToCategory.get(id))
    .filter((c): c is Category => !!c);
  return {
    orderedIds: categories.map((c) => c.id),
    nextDetail: { ...detail, categories },
  };
}

/** Shareable channel link (same ?conv= deep-link convention as notification clicks). */
export function channelLink(roomId: string, channelId: string): string {
  return `/dashboard?conv=room:${roomId}:${channelId}`;
}

export type ConvParam = {
  kind: "dm" | "room";
  id: string;
  channelId?: string;
} | null;

/** Parse a `?conv=` value: `dm:<id>` | `room:<roomId>` | `room:<roomId>:<channelId>`. */
export function parseConvParam(raw: string | null): ConvParam {
  if (!raw) return null;
  const sep = raw.indexOf(":");
  if (sep <= 0) return null;
  const kind = raw.slice(0, sep);
  const rest = raw.slice(sep + 1);
  if (!rest) return null;
  if (kind === "dm") return { kind, id: rest };
  if (kind === "room") {
    const [roomId, channelId] = rest.split(":");
    if (!roomId) return null;
    return channelId ? { kind, id: roomId, channelId } : { kind, id: roomId };
  }
  return null;
}
