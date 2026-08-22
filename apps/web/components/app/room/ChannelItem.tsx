"use client";

// A single channel row in the room sidebar: type glyph (# vs 🔊), name, and
// the active / unread states. Voice participant count + avatar stack is wired
// in the calling phase (needs call presence), so VOICE rows render as plain
// rows here. Admins also get a drag handle (dnd reorder) and a "⋯" affordance;
// every row can be right-clicked. The context menu is portal-rendered so it
// isn't clipped by the sidebar's scroll container.
import { useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useShell } from "../state";
import type { Channel, ChannelUnreadState } from "../types";
import { channelUnreadStatus } from "../helpers";
import { GripIcon, HashIcon, MoreIcon, SpeakerIcon } from "../icons";
import { ChannelContextMenu, type MenuPosition } from "./ChannelContextMenu";
import { useCallStore } from "../callStore";

export function ChannelItem({
  channel,
  active,
  unreadState,
  canManage,
  containerId,
  dragEnabled,
}: {
  channel: Channel;
  active: boolean;
  unreadState?: ChannelUnreadState;
  canManage: boolean;
  /** Which drag container (category) this row belongs to. */
  containerId: string;
  /** Reorder is enabled for admins; members render a plain row. */
  dragEnabled: boolean;
}) {
  const { openChannel, roomNotificationPrefs } = useShell();
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const Icon = channel.type === "VOICE" ? SpeakerIcon : HashIcon;

  const callActiveChannelId = useCallStore((s) => s.activeChannelId);
  const callParticipants = useCallStore((s) => s.participants);
  const isInCall = callActiveChannelId === channel.id;

  // Phase 6 §10.1: derive the visual unread state from the server-synced
  // counts plus this user's room notification pref (muted suppresses dots).
  const status = channelUnreadStatus(
    unreadState,
    roomNotificationPrefs[channel.roomId],
  );
  const mentioned = status === "mentioned";
  const unread = status === "unread" || mentioned;
  const muted = status === "muted";

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: channel.id,
    disabled: !dragEnabled,
    data: { type: "channel", container: containerId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  function openMenuAt(x: number, y: number) {
    setMenu({ x, y });
  }

  function openMenuFromButton() {
    const rect = rowRef.current?.getBoundingClientRect();
    openMenuAt(rect ? rect.left : 0, rect ? rect.bottom + 4 : 0);
  }

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        rowRef.current = node;
      }}
      style={style}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenuAt(e.clientX, e.clientY);
      }}
      className="group relative flex items-center"
    >
      {dragEnabled && (
        <button
          {...attributes}
          {...listeners}
          className="flex h-5 w-5 flex-none cursor-grab items-center justify-center rounded-md text-muted opacity-100 transition-opacity duration-150 ease-app hover:text-fg md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 active:cursor-grabbing"
          aria-label={`Reorder ${channel.name}`}
          title="Drag to reorder"
        >
          <GripIcon className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-[9px] px-2.5 py-[7px] text-left text-[13.5px] font-bold transition-colors duration-150 ease-app ${
          active
            ? "bg-accent-soft text-accent-solid"
            : unread
              ? "text-fg"
              : muted
                ? "text-muted/60"
                : "text-muted hover:bg-surface-2 hover:text-fg"
        }`}
        onClick={() => {
          if (channel.type === "VOICE") {
            // For voice channels, show the pre-join preview instead of directly navigating.
            // The preview handles LiveKit device setup before joining.
            const call = useCallStore.getState();
            if (call.activeChannelId === channel.id) {
              // Already in this channel's call — just navigate to it.
              openChannel(channel.roomId, channel.id);
            } else {
              // Set preview state: activeSessionId stays null until the user
              // actually joins and the server returns a real session ID.
              call.setPreviewOpen(true);
              call.setActiveCall(null, channel.id, channel.roomId);
            }
          } else {
            openChannel(channel.roomId, channel.id);
          }
        }}
        aria-current={active ? "true" : undefined}
        title={channel.topic ?? channel.name}
      >
        <Icon
          className={`h-[17px] w-[17px] flex-none ${active ? "" : "opacity-70"}`}
        />
        <div className="flex flex-col min-w-0 flex-1 justify-center leading-tight">
          <span
            className={`truncate ${unread && !active ? "font-extrabold" : ""}`}
          >
            {channel.name}
          </span>
          {channel.type === "VOICE" && isInCall && callParticipants.length > 0 && (
            <span className="text-[10.5px] text-muted tabular-nums">
              {callParticipants.length} in call
            </span>
          )}
        </div>
        {unread &&
          !active &&
          (mentioned ? (
            <span
              className="flex h-4 flex-none items-center gap-0.5 rounded-full bg-danger px-1.5 text-[10px] font-extrabold leading-none text-white"
              aria-label={`${unreadState?.mentionCount ?? 1} mention${(unreadState?.mentionCount ?? 1) === 1 ? "" : "s"}`}
            >
              @
              {(unreadState?.mentionCount ?? 1) > 9
                ? "9+"
                : (unreadState?.mentionCount ?? 1)}
            </span>
          ) : (
            <span
              className="h-2 w-2 flex-none rounded-full bg-accent-solid"
              aria-label="Unread"
            />
          ))}
      </button>
      <button
        className="flex h-5 w-5 flex-none cursor-pointer items-center justify-center rounded-md text-muted opacity-100 transition-opacity duration-150 ease-app hover:bg-surface-2 hover:text-fg md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          openMenuFromButton();
        }}
        aria-label={`Options for ${channel.name}`}
        title="Channel options"
      >
        <MoreIcon className="h-[15px] w-[15px]" />
      </button>
      {menu && (
        <ChannelContextMenu
          roomId={channel.roomId}
          channel={channel}
          canManage={canManage}
          position={menu}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
