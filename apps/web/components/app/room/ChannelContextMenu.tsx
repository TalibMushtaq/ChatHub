"use client";

// Channel context menu (Phase 3 §7.3): opened by right-click or the row's
// "⋯" button. Admins get the management set (Edit / Notifications / Copy link /
// Delete); members get Notifications + Copy link. Destructive delete goes
// through the shared confirm modal; the server is the authorization authority.
// Rendered through a portal with fixed coordinates because the sidebar's
// channel list scrolls — an absolutely-positioned menu would be clipped.
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useShell } from "../state";
import { ChatAPI, getErrorMessage } from "../api";
import type { Channel } from "../types";
import { BellIcon, CopyIcon, EditIcon, TrashIcon } from "../icons";
import { channelLink } from "./sidebarReorder";
import { MenuList, type MenuItem } from "./MenuList";

export interface MenuPosition {
  x: number;
  y: number;
}

export function ChannelContextMenu({
  roomId,
  channel,
  canManage,
  position,
  onClose,
}: {
  roomId: string;
  channel: Channel;
  canManage: boolean;
  position: MenuPosition;
  onClose: () => void;
}) {
  const {
    openModal,
    toast,
    active,
    roomDetails,
    patchRoomDetail,
    openChannel,
  } = useShell();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function copyLink() {
    void navigator.clipboard
      .writeText(channelLink(roomId, channel.id))
      .then(() => toast("Channel link copied", "success"))
      .catch(() => toast("Couldn't copy the link", "error"));
    onClose();
  }

  function askDelete() {
    openModal("confirm", {
      title: "Delete channel",
      text: `Delete #${channel.name}? Its messages will be permanently deleted. This can't be undone.`,
      danger: true,
      onYes: async () => {
        try {
          await ChatAPI.deleteChannel(roomId, channel.id);
          // Drop the channel from the cached tree (message rows cascade in the
          // DB). Computed up front so the same filtered detail drives both the
          // patch and the active-channel fallback below.
          const before = roomDetails[roomId];
          const after = before
            ? {
                ...before,
                categories: before.categories.map((cat) => ({
                  ...cat,
                  channels: (cat.channels ?? []).filter(
                    (c) => c.id !== channel.id,
                  ),
                })),
                uncategorized: before.uncategorized.filter(
                  (c) => c.id !== channel.id,
                ),
              }
            : undefined;
          if (after) patchRoomDetail(roomId, () => after);
          if (
            active?.kind === "room" &&
            active.id === roomId &&
            active.channelId === channel.id &&
            after
          ) {
            const all = [
              ...after.categories.flatMap((c) => c.channels ?? []),
              ...after.uncategorized,
            ];
            const fallback =
              all.find((c) => c.name.toLowerCase() === "general") ?? all[0];
            if (fallback) openChannel(roomId, fallback.id);
          }
          toast(`#${channel.name} deleted`, "success");
        } catch (err) {
          toast(getErrorMessage(err, "Couldn't delete the channel"), "error");
        }
      },
    });
  }

  const items: MenuItem[] = [];
  if (canManage) {
    items.push({
      label: "Edit Channel",
      icon: <EditIcon className="h-4 w-4 flex-none" />,
      onClick: () => {
        openModal("editChannel", { roomId, channelId: channel.id });
        onClose();
      },
    });
  }
  items.push({
    label: "Notification Settings",
    icon: <BellIcon className="h-4 w-4 flex-none" />,
    onClick: () => {
      openModal("notifications");
      onClose();
    },
  });
  items.push({
    label: "Copy Channel Link",
    icon: <CopyIcon className="h-4 w-4 flex-none" />,
    onClick: copyLink,
  });
  if (canManage) {
    items.push({
      label: "Delete Channel",
      icon: <TrashIcon className="h-4 w-4 flex-none" />,
      danger: true,
      onClick: () => {
        onClose();
        askDelete();
      },
    });
  }

  // Keep the menu on screen: clamp to the viewport with a small margin.
  const style = {
    top: Math.min(
      position.y,
      (typeof window !== "undefined" ? window.innerHeight : 0) - 190,
    ),
    left: Math.min(
      position.x,
      (typeof window !== "undefined" ? window.innerWidth : 0) - 230,
    ),
  };

  return createPortal(
    <div
      ref={wrapRef}
      style={style}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-[95] min-w-[210px] rounded-[14px] border border-border bg-surface p-0 shadow-lg animate-[pop_.13s_cubic-bezier(.2,.8,.2,1)]"
    >
      <MenuList items={items} />
    </div>,
    document.body,
  );
}
