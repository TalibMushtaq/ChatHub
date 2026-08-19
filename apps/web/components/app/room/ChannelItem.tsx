"use client";

// A single channel row in the room sidebar: type glyph (# vs 🔊), name, and
// the active / unread states. Voice participant count + avatar stack is wired
// in the calling phase (needs call presence), so VOICE rows render as plain
// rows here.
import { useShell } from "../state";
import type { Channel } from "../types";
import { HashIcon, SpeakerIcon } from "../icons";

export function ChannelItem({
  channel,
  active,
  unread,
}: {
  channel: Channel;
  active: boolean;
  unread: boolean;
}) {
  const { openChannel } = useShell();
  const Icon = channel.type === "VOICE" ? SpeakerIcon : HashIcon;

  return (
    <button
      className={`group flex w-full cursor-pointer items-center gap-2 rounded-[9px] px-2.5 py-[7px] text-left text-[13.5px] font-bold transition-colors duration-150 ease-app ${
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
  );
}
