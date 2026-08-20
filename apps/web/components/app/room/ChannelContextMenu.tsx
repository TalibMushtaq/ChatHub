"use client";

// Channel context menu (Phase 3 §7.3): opened by right-click or the row's
// "⋯" button. Admins get the management set (Edit / Notifications / Copy link /
// Delete); members get Notifications + Copy link. Destructive delete goes
// through the shared confirm modal; the server is the authorization authority.
// Rendered through a portal with fixed coordinates because the sidebar's
// channel list scrolls — an absolutely-positioned menu would be clipped.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useShell } from "../state";
import { ChatAPI, getErrorMessage } from "../api";
import type { Channel } from "../types";
import { BellIcon, CheckIcon, CopyIcon, EditIcon, TrashIcon } from "../icons";
import { channelLink } from "./sidebarReorder";
import { MenuList, type MenuItem } from "./MenuList";

export interface MenuPosition {
  x: number;
  y: number;
}

type NotifPref = "ALL" | "MENTIONS" | "MUTED";

const NOTIF_OPTIONS: { value: NotifPref; label: string }[] = [
  { value: "ALL", label: "All messages" },
  { value: "MENTIONS", label: "Only mentions" },
  { value: "MUTED", label: "Muted" },
];

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
    setRoomNotificationPrefs,
  } = useShell();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [showNotifPrefs, setShowNotifPrefs] = useState(false);
  const [currentPref, setCurrentPref] = useState<NotifPref | null>(null);
  const [saving, setSaving] = useState(false);

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

  // Notification prefs are stored per room (ChatRoomMember.notificationPref);
  // the channel menu surfaces the same three choices so members can tune
  // alerting without opening full Settings. Optimistic, reconciled by the server.
  async function openNotifPrefs() {
    setShowNotifPrefs(true);
    try {
      const { notificationPref } =
        await ChatAPI.getRoomMemberNotificationPref(roomId);
      setCurrentPref(notificationPref);
    } catch {
      setCurrentPref("ALL");
    }
  }

  async function choosePref(pref: NotifPref) {
    setSaving(true);
    try {
      await ChatAPI.updateRoomNotificationPref(roomId, pref);
      setCurrentPref(pref);
      // Mirror into the shell so the sidebar suppresses/dims unread state live.
      setRoomNotificationPrefs((prev) => ({ ...prev, [roomId]: pref }));
      toast(`Notifications set to ${pref.toLowerCase()}`, "success");
      onClose();
    } catch (err) {
      toast(
        getErrorMessage(err, "Couldn't update notification settings"),
        "error",
      );
    } finally {
      setSaving(false);
    }
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
      if (showNotifPrefs) onClose();
      else void openNotifPrefs();
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
      <div className="max-h-[320px] overflow-y-auto">
        <MenuList items={items} />
        {showNotifPrefs && (
          <div className="border-t border-border p-1.5">
            <p className="px-2 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
              Notify for
            </p>
            {NOTIF_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className="flex w-full cursor-pointer items-center gap-2 rounded-[9px] px-2 py-1.5 text-left text-[13.5px] font-semibold text-fg transition-colors hover:bg-surface-2 disabled:opacity-50"
                disabled={saving || currentPref === null}
                onClick={() => void choosePref(opt.value)}
              >
                <span className="flex-1">{opt.label}</span>
                {currentPref === opt.value && (
                  <CheckIcon className="h-4 w-4 flex-none text-accent-solid" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
