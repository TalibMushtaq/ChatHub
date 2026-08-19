"use client";

// Room sidebar: the room header (icon + name + dropdown) and the full
// category → channel tree. Renders loading/empty states and hands collapse
// state up to RoomShell so channel switches don't reset it.
import { useState } from "react";
import { useShell } from "../state";
import type { RoomDetail } from "../types";
import AppAvatar from "../AppAvatar";
import { MoreIcon } from "../icons";
import { CategorySection, UncategorizedSection } from "./CategorySection";
import { RoomHeaderMenu } from "./RoomHeaderMenu";

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
  const { openModal, active } = useShell();
  const [menuOpen, setMenuOpen] = useState(false);

  const canManage =
    active?.kind === "room" &&
    (active.myRole === "OWNER" || active.myRole === "ADMIN");
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
        {detail.categories.map((cat) => (
          <CategorySection
            key={cat.id}
            roomId={detail.id}
            category={cat}
            channels={cat.channels ?? []}
            collapsed={!!collapsed[cat.id]}
            onToggle={() => onToggleCategory(cat.id)}
            activeChannelId={activeChannelId}
          />
        ))}
        <UncategorizedSection
          roomId={detail.id}
          channels={detail.uncategorized}
          activeChannelId={activeChannelId}
        />
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
                  className="h-[30px] animate-pulse rounded-[9px] bg-surface-2"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
