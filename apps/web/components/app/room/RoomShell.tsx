"use client";

// The room shell (Phase 2): room sidebar (categories → channels), the active
// channel's header + timeline + composer, and the members sidebar. Rendered by
// AppShell in the thread column when `active.kind === "room"`; the app never
// navigates for a room — this IS the room view, so switching rooms re-mounts
// it (keyed by room id) to reset drawer/collapse state.
import { useState } from "react";
import { useShell } from "../state";
import type { Channel, RoomDetail } from "../types";
import { useRoomDetail } from "./useRoomDetail";
import { RoomSidebar, RoomSidebarSkeleton } from "./RoomSidebar";
import { ChannelHeader } from "./ChannelHeader";
import { ChannelMessageArea } from "./ChannelMessageArea";
import { MemberSidebar } from "./MemberSidebar";
import { btnPrimary } from "../styles";

function findChannel(
  detail: RoomDetail,
  channelId?: string,
): Channel | undefined {
  if (!channelId) return undefined;
  for (const cat of detail.categories) {
    const hit = (cat.channels ?? []).find((c) => c.id === channelId);
    if (hit) return hit;
  }
  return detail.uncategorized.find((c) => c.id === channelId);
}

export default function RoomShell() {
  const { active, roomMembers, openModal, typing } = useShell();
  const room = active && active.kind === "room" ? active : null;
  const roomId = room?.id ?? "";
  const { detail, loading, error, refresh } = useRoomDetail(roomId);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);

  if (!room) return null;
  const channel = detail ? findChannel(detail, room.channelId) : undefined;
  const members = roomMembers[roomId] ?? [];
  const typers = typing[`room:${roomId}`] ?? [];
  const canManage = room.myRole === "OWNER" || room.myRole === "ADMIN";

  const toggleCategory = (categoryId: string) =>
    setCollapsed((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }));

  return (
    <div className="room flex h-full min-h-0 min-w-0 flex-1">
      {/* Mobile drawer scrim for the room sidebar */}
      <div
        className={`fixed inset-0 z-[55] bg-black/45 transition-opacity duration-200 md:hidden ${
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      {/* Room sidebar column (drawer on mobile) */}
      <aside
        className={`flex h-full min-h-0 w-[270px] flex-none flex-col border-r border-border bg-surface transition-transform duration-[260ms] ease-app max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-[60] max-md:w-[300px] max-md:max-w-[85vw] max-md:shadow-lg ${
          sidebarOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"
        }`}
      >
        {loading && !detail ? (
          <RoomSidebarSkeleton />
        ) : error && !detail ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-[13px] text-muted">{error}</p>
            <button
              className={`${btnPrimary} text-[12.5px]`}
              onClick={() => void refresh()}
            >
              Retry
            </button>
          </div>
        ) : detail ? (
          <RoomSidebar
            detail={detail}
            collapsed={collapsed}
            onToggleCategory={toggleCategory}
            activeChannelId={room.channelId}
          />
        ) : null}
      </aside>

      {/* Channel main column */}
      <div className="room-main flex min-h-0 min-w-0 flex-1 flex-col">
        {channel ? (
          <>
            <ChannelHeader
              channel={channel}
              memberCount={members.length}
              memberOpen={memberOpen}
              onToggleMember={() => setMemberOpen((v) => !v)}
              onOpenSidebar={() => setSidebarOpen(true)}
              typers={typers}
            />
            <ChannelMessageArea key={channel.id} channel={channel} />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-[14.5px] font-extrabold text-fg">
              {detail ? `Welcome to ${detail.name}` : "This room is empty"}
            </p>
            <p className="max-w-[320px] text-[13px] text-muted">
              {canManage
                ? "Create a channel to start the conversation."
                : "No channels here yet. Ask an owner or admin to set one up."}
            </p>
            {canManage && (
              <button
                className={`${btnPrimary} mt-1`}
                onClick={() => openModal("createChannel", { roomId })}
              >
                Create your first channel
              </button>
            )}
          </div>
        )}
      </div>

      {/* Members sidebar (right column / bottom sheet) */}
      <MemberSidebar
        roomId={roomId}
        open={memberOpen}
        onClose={() => setMemberOpen(false)}
      />
    </div>
  );
}
