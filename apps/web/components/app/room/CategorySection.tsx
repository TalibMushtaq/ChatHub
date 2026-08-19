"use client";

// Collapsible category section in the room sidebar: the category header (name +
// chevron, with a plus action for admins) and its channels. Collapse state is
// owned by RoomShell so it survives channel switches within the session.
import type { Channel } from "../types";
import { ChevronIcon, PlusIcon } from "../icons";
import { useShell } from "../state";
import { ChannelItem } from "./ChannelItem";

export function CategorySection({
  roomId,
  category,
  channels,
  collapsed,
  onToggle,
  activeChannelId,
  collapsible = true,
}: {
  roomId: string;
  category: { id: string; name: string };
  channels: Channel[];
  collapsed: boolean;
  onToggle: () => void;
  activeChannelId?: string;
  /** Uncategorized has no collapse affordance — always rendered expanded. */
  collapsible?: boolean;
}) {
  const { openModal, channelUnread, active } = useShell();
  const canManage =
    active?.kind === "room" &&
    (active.myRole === "OWNER" || active.myRole === "ADMIN");

  return (
    <div className="category group mt-2">
      <div className="cat-head flex items-center gap-1 px-1">
        <button
          className={`flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md px-1 py-1 text-left text-[11.5px] font-extrabold tracking-[0.06em] text-muted transition-colors duration-150 ease-app hover:text-fg ${
            collapsible ? "" : "cursor-default"
          }`}
          onClick={collapsible ? onToggle : undefined}
          aria-expanded={collapsible ? !collapsed : undefined}
          aria-label={`Toggle category ${category.name}`}
        >
          {collapsible && (
            <ChevronIcon
              className={`h-3.5 w-3.5 flex-none transition-transform duration-150 ease-app ${
                collapsed ? "-rotate-90" : ""
              }`}
            />
          )}
          <span className="truncate uppercase">{category.name}</span>
        </button>
        {canManage && (
          <button
            className="flex h-5 w-5 flex-none cursor-pointer items-center justify-center rounded-md text-muted transition-colors duration-150 ease-app hover:bg-surface-2 hover:text-fg"
            onClick={() =>
              openModal("createChannel", { roomId, categoryId: category.id })
            }
            aria-label={`Create channel in ${category.name}`}
            title="Create channel"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {(!collapsible || !collapsed) && (
        <div className="mt-0.5 flex flex-col gap-px pl-1">
          {channels.map((c) => (
            <ChannelItem
              key={c.id}
              channel={c}
              active={c.id === activeChannelId}
              unread={!!channelUnread[`room:${c.roomId}:${c.id}`]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function UncategorizedSection({
  roomId,
  channels,
  activeChannelId,
}: {
  roomId: string;
  channels: Channel[];
  activeChannelId?: string;
}) {
  if (channels.length === 0) return null;
  return (
    <CategorySection
      roomId={roomId}
      category={{ id: "__uncategorized", name: "Uncategorized" }}
      channels={channels}
      collapsed={false}
      onToggle={() => {}}
      collapsible={false}
      activeChannelId={activeChannelId}
    />
  );
}
