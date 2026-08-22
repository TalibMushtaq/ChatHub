"use client";

// Room sidebar: the room header (icon + name + dropdown) and the full
// category → channel tree. Owns the DnD context for Phase 3 reorder — categories
// sort by their header, channels sort/move across categories via per-category
// containers. Reorder state is held in a local `dragContainers` snapshot seeded
// on drag start so the global room-detail cache isn't churned mid-drag; the
// final arrangement is patched optimistically then reconciled with the server.
import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useShell } from "../state";
import { ChatAPI, getErrorMessage } from "../api";
import type { Channel, RoomDetail } from "../types";
import AppAvatar from "../AppAvatar";
import { MoreIcon } from "../icons";
import { CategorySection } from "./CategorySection";
import { RoomHeaderMenu } from "./RoomHeaderMenu";
import {
  UNCATEGORIZED_ID,
  channelsByCategory,
  channelContainer,
  applyDragOver,
  channelReorderResult,
  categoryReorderResult,
  type ChannelContainers,
} from "./sidebarReorder";

export function RoomSidebar({
  detail,
  collapsed,
  onToggleCategory,
  activeChannelId,
}: {
  detail: RoomDetail;
  /** categoryId -> collapsed (categoryId "__uncategorized" unused; it never collapses). */
  collapsed: Record<string, boolean>;
  onToggleCategory: (categoryId: string) => void;
  activeChannelId?: string;
}) {
  const { openModal, active, patchRoomDetail, refreshRoomDetail, toast } =
    useShell();
  const [menuOpen, setMenuOpen] = useState(false);

  const canManage =
    active?.kind === "room" &&
    (active.myRole === "OWNER" || active.myRole === "ADMIN");

  const baseContainers = useMemo(() => channelsByCategory(detail), [detail]);
  const channelById = useMemo(() => {
    const m = new Map<string, Channel>();
    for (const cat of detail.categories) {
      for (const c of cat.channels ?? []) m.set(c.id, c);
    }
    for (const c of detail.uncategorized) m.set(c.id, c);
    return m;
  }, [detail]);

  // Live arrangement during an active drag; null means "not dragging".
  const [dragContainers, setDragContainers] =
    useState<ChannelContainers | null>(null);
  const dragStartContainersRef = useRef<ChannelContainers | null>(null);
  const containers = dragContainers ?? baseContainers;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragStart() {
    dragStartContainersRef.current = channelsByCategory(detail);
    setDragContainers(dragStartContainersRef.current);
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.data.current?.type !== "channel") return;
    const activeId = String(active.id);
    const overRawId = String(over.id);
    setDragContainers((prev) => {
      const cur = prev ?? baseContainers;
      const activeContainer = channelContainer(cur, activeId);
      if (!activeContainer) return prev;
      // Over a category's channel-list area (or its header) → drop at the end
      // of that category; over a channel → insert at its slot.
      let overContainer: string | null;
      let overId: string | null = overRawId;
      if (overRawId.startsWith("container:")) {
        overContainer = overRawId.slice("container:".length);
        overId = null;
      } else if (overRawId.startsWith("category:")) {
        overContainer = overRawId.slice("category:".length);
        overId = null;
      } else {
        overContainer = channelContainer(cur, overRawId);
      }
      if (!overContainer) return prev;
      return applyDragOver(
        cur,
        activeId,
        activeContainer,
        overId,
        overContainer,
      );
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const type = active.data.current?.type;

    if (type === "category") {
      const activeCatId = active.data.current?.categoryId as string | undefined;
      const overCatId = over?.data.current?.categoryId as string | undefined;
      if (activeCatId && overCatId && activeCatId !== overCatId) {
        const ids = detail.categories.map((c) => c.id);
        const oldIndex = ids.indexOf(activeCatId);
        const newIndex = ids.indexOf(overCatId);
        if (oldIndex >= 0 && newIndex >= 0) {
          const reordered = [...ids];
          const [moved] = reordered.splice(oldIndex, 1);
          reordered.splice(newIndex, 0, moved!);
          const { orderedIds, nextDetail } = categoryReorderResult(
            detail,
            reordered,
          );
          patchRoomDetail(detail.id, () => nextDetail);
          void ChatAPI.reorderCategories(detail.id, orderedIds).catch((err) => {
            toast(getErrorMessage(err, "Couldn't reorder categories"), "error");
            void refreshRoomDetail(detail.id);
          });
        }
      }
      setDragContainers(null);
      return;
    }

    // Channel drop: reconcile the live arrangement with the server.
    const finalContainers = dragContainers;
    setDragContainers(null);
    if (!finalContainers) return;
    if (
      JSON.stringify(finalContainers) ===
      JSON.stringify(dragStartContainersRef.current)
    ) {
      return;
    }
    const { items, nextDetail } = channelReorderResult(detail, finalContainers);
    patchRoomDetail(detail.id, () => nextDetail);
    void ChatAPI.reorderChannels(detail.id, items).catch((err) => {
      toast(getErrorMessage(err, "Couldn't reorder channels"), "error");
      void refreshRoomDetail(detail.id);
    });
  }

  const hasChannels =
    detail.categories.some((c) => (c.channels ?? []).length > 0) ||
    detail.uncategorized.length > 0;

  return (
    <div className="room-side flex h-full min-h-0 flex-col">
      {/* Room header — doubles as the sidebar header (Phase 2 §6.1). */}
      <div className="relative flex items-center gap-2.5 border-b border-border px-3 py-3">
        <AppAvatar name={detail.name} src={detail.avatar} size={38} square />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-extrabold leading-tight">
            {detail.name}
          </div>
        </div>
        <button
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors duration-150 ease-app hover:bg-surface-2 hover:text-fg"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Room menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Room menu"
        >
          <MoreIcon className="h-5 w-5" />
        </button>
        {menuOpen && (
          <RoomHeaderMenu
            roomId={detail.id}
            roomName={detail.name}
            roomAvatar={detail.avatar}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>

      {/* Channel tree */}
      <div className="room-chans min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {!hasChannels && (
          <div className="px-2 py-6 text-center text-[13px] text-muted">
            {canManage ? (
              <>
                <p className="mb-2">No channels yet.</p>
                <button
                  className="cursor-pointer rounded-full bg-accent-btn px-3.5 py-1.5 text-[12.5px] font-extrabold text-accent-on transition-colors duration-150 ease-app hover:bg-accent-hover"
                  onClick={() =>
                    openModal("createChannel", { roomId: detail.id })
                  }
                >
                  Create your first channel
                </button>
              </>
            ) : (
              <p>No channels in this room yet.</p>
            )}
          </div>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragContainers(null)}
        >
          <SortableContext
            items={detail.categories.map((c) => `category:${c.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {detail.categories.map((cat) => (
              <CategorySection
                key={cat.id}
                roomId={detail.id}
                category={cat}
                channelIds={containers[cat.id] ?? []}
                channelById={channelById}
                collapsed={!!collapsed[cat.id]}
                onToggle={() => onToggleCategory(cat.id)}
                activeChannelId={activeChannelId}
                canManage={canManage}
                dragEnabled={canManage}
                channelReorderEnabled={canManage}
              />
            ))}
            <CategorySection
              key={UNCATEGORIZED_ID}
              roomId={detail.id}
              category={{ id: UNCATEGORIZED_ID, name: "Uncategorized" }}
              channelIds={containers[UNCATEGORIZED_ID] ?? []}
              channelById={channelById}
              collapsed={false}
              onToggle={() => {}}
              collapsible={false}
              activeChannelId={activeChannelId}
              canManage={canManage}
              dragEnabled={false}
              channelReorderEnabled={canManage}
            />
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

export function RoomSidebarSkeleton() {
  return (
    <div className="room-side flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2.5 border-b border-border px-3 py-3">
        <div className="h-[38px] w-[38px] animate-pulse rounded-[12px] bg-surface-2" />
        <div className="h-[16px] w-[120px] animate-pulse rounded-md bg-surface-2" />
      </div>
      <div className="px-3 pt-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="mb-5">
            <div className="h-[12px] w-[70px] animate-pulse rounded bg-surface-2" />
            <div className="mt-2 flex flex-col gap-1.5">
              {[0, 1, 2].map((j) => (
                <div
                  key={j}
                  className="flex h-[30px] animate-pulse items-center gap-2 rounded-[9px] px-2.5 bg-surface-2/50"
                >
                  <div className="h-[14px] w-[14px] rounded-full bg-surface-2" />
                  <div className="h-[10px] w-2/3 rounded-sm bg-surface-2" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
