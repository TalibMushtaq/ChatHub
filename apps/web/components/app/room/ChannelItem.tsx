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
import type { Channel } from "../types";
import { GripIcon, HashIcon, MoreIcon, SpeakerIcon } from "../icons";
import { ChannelContextMenu, type MenuPosition } from "./ChannelContextMenu";

export function ChannelItem({
  channel,
  active,
  unread,
  canManage,
  containerId,
  dragEnabled,
}: {
  channel: Channel;
  active: boolean;
  unread: boolean;
  canManage: boolean;
  /** Which drag container (category) this row belongs to. */
  containerId: string;
  /** Reorder is enabled for admins; members render a plain row. */
  dragEnabled: boolean;
}) {
  const { openChannel } = useShell();
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const Icon = channel.type === "VOICE" ? SpeakerIcon : HashIcon;

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
              : "text-muted hover:bg-surface-2 hover:text-fg"
        }`}
        onClick={() => openChannel(channel.roomId, channel.id)}
        aria-current={active ? "true" : undefined}
        title={channel.topic ?? channel.name}
      >
        <Icon
          className={`h-[17px] w-[17px] flex-none ${active ? "" : "opacity-70"}`}
        />
        <span
          className={`min-w-0 flex-1 truncate ${unread && !active ? "font-extrabold" : ""}`}
        >
          {channel.name}
        </span>
        {unread && !active && (
          <span
            className="h-2 w-2 flex-none rounded-full bg-accent-solid"
            aria-label="Unread"
          />
        )}
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
