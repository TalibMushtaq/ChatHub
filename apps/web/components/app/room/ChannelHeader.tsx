"use client";

// Channel header above a channel's timeline: hamburger (mobile sidebar
// drawer), channel name + topic + typing indicator, the members toggle, and
// the per-room notification settings entry.
import type { Channel, TypingUser } from "../types";
import { useShell } from "../state";
import { BellIcon, ChevronIcon, UsersIcon } from "../icons";
import { iconBtn } from "../styles";
import { Tooltip } from "../Tooltip";

export function ChannelHeader({
  channel,
  memberCount,
  memberOpen,
  onToggleMember,
  onOpenSidebar,
  typers,
}: {
  channel: Channel;
  memberCount: number;
  memberOpen: boolean;
  onToggleMember: () => void;
  /** Mobile only: slide the room sidebar drawer in. */
  onOpenSidebar: () => void;
  /** Room-wide typing list — shown in the channel header (Phase 2 keeps typing
      room-scoped; per-channel typing is out of scope). */
  typers: TypingUser[];
}) {
  const { openModal } = useShell();

  return (
    <div className="channel-head flex items-center gap-1 border-b border-border bg-surface px-2 py-2">
      <button
        className={`${iconBtn} h-9 w-9 md:hidden`}
        onClick={onOpenSidebar}
        aria-label="Show room sidebar"
      >
        <ChevronIcon className="h-5 w-5 rotate-90" />
      </button>
      <div className="min-w-0 flex-1 px-1">
        <div className="flex items-center gap-2">
          <span className="text-muted">#</span>
          <span className="truncate text-[15px] font-extrabold">
            {channel.name}
          </span>
        </div>
        {typers.length > 0 ? (
          <div className="truncate text-[11.5px] font-semibold text-accent-solid">
            {typers.map((t) => t.username).join(", ")} typing…
          </div>
        ) : channel.topic ? (
          <div className="truncate text-[11.5px] font-semibold text-muted">
            {channel.topic}
          </div>
        ) : null}
      </div>
      <Tooltip label="Channel notifications">
        <button
          className={`${iconBtn} h-9 w-9`}
          onClick={() => openModal("notifications")}
          aria-label="Channel notifications"
        >
          <BellIcon className="h-[18px] w-[18px]" />
        </button>
      </Tooltip>
      <Tooltip label="Members">
        <button
          className={`${iconBtn} relative h-9 w-9 ${memberOpen ? "bg-accent-soft text-accent-solid" : ""}`}
          onClick={onToggleMember}
          aria-label="Toggle member list"
          aria-expanded={memberOpen}
        >
          <UsersIcon className="h-[18px] w-[18px]" />
          <span className="absolute -right-0.5 -top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-danger px-[3px] text-[9.5px] font-extrabold text-white">
            {memberCount > 99 ? "99+" : memberCount}
          </span>
        </button>
      </Tooltip>
    </div>
  );
}
