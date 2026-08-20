"use client";

// Dropdown menu under the room sidebar header (Phase 2 §6.1). Authorized users
// (OWNER/ADMIN) get the management menu; members get the notification/invite/
// leave set. Items that belong to later phases open the closest existing
// surface (roomInfo modal) rather than rendering dead buttons.
import { useEffect, useRef, useState } from "react";
import { useShell } from "../state";
import { getErrorMessage } from "../api";
import AppAvatar from "../AppAvatar";
import {
  BellIcon,
  GearIcon,
  LogoutIcon,
  PlusIcon,
  TrashIcon,
  UserIcon,
  UsersIcon,
} from "../icons";

export function RoomHeaderMenu({
  roomId,
  roomName,
  roomAvatar,
  onClose,
}: {
  roomId: string;
  roomName: string;
  roomAvatar?: string | null;
  onClose: () => void;
}) {
  const {
    openModal,
    toast,
    leaveRoom,
    closeConv,
    refreshLists,
    user,
    roomInfo,
    active,
  } = useShell();
  const [leaving, setLeaving] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // roomInfo() reflects the room list entry; fall back to the active conv's
  // role (e.g. right after creating a room, before refreshLists resolves).
  const info = roomInfo();
  const role = info?.myRole ?? active?.myRole;
  const isAdmin = role === "OWNER" || role === "ADMIN";

  // Close on outside click and Escape (dialog-focus-lite: the menu is a small
  // transient popover, so we only manage outside/Escape dismissal here).
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

  function askLeave() {
    openModal("confirm", {
      title: "Leave room",
      text: `Leave ${roomName}? You'll stop seeing its channels and messages.`,
      danger: true,
      onYes: async () => {
        setLeaving(true);
        try {
          await leaveRoom(roomId);
          toast("Left the room", "success");
          closeConv();
          void refreshLists();
        } catch (err) {
          toast(getErrorMessage(err, "Couldn't leave the room"), "error");
        } finally {
          setLeaving(false);
        }
      },
    });
  }

  const items: {
    label: string;
    icon: React.ReactNode;
    danger?: boolean;
    onClick: () => void;
    disabled?: boolean;
  }[] = [];

  if (isAdmin) {
    items.push(
      {
        label: "Room Settings",
        icon: <GearIcon className="h-4 w-4 flex-none" />,
        onClick: () => openModal("roomSettings", roomId),
      },
      {
        label: "Invite People",
        icon: <UserIcon className="h-4 w-4 flex-none" />,
        onClick: () => openModal("invite", roomId),
      },
      {
        label: "Manage Members",
        icon: <UsersIcon className="h-4 w-4 flex-none" />,
        onClick: () => openModal("roomInfo"),
      },
      {
        label: "Banned Users",
        icon: <TrashIcon className="h-4 w-4 flex-none" />,
        onClick: () => openModal("banList", roomId),
      },
      {
        label: "Create Category",
        icon: <PlusIcon className="h-4 w-4 flex-none" />,
        onClick: () => openModal("createCategory", roomId),
      },
      {
        label: "Create Channel",
        icon: <PlusIcon className="h-4 w-4 flex-none" />,
        onClick: () => openModal("createChannel", { roomId }),
      },
      {
        label: "Leave Room",
        icon: <LogoutIcon className="h-4 w-4 flex-none" />,
        danger: true,
        onClick: askLeave,
        disabled: leaving,
      },
    );
  } else {
    items.push(
      {
        label: "Notifications",
        icon: <BellIcon className="h-4 w-4 flex-none" />,
        onClick: () => openModal("notifications"),
      },
      {
        label: "Invite People",
        icon: <UserIcon className="h-4 w-4 flex-none" />,
        onClick: () => openModal("invite", roomId),
      },
      {
        label: "Leave Room",
        icon: <LogoutIcon className="h-4 w-4 flex-none" />,
        danger: true,
        onClick: askLeave,
        disabled: leaving,
      },
    );
  }

  return (
    <div
      ref={wrapRef}
      className="absolute left-0 top-full z-[90] mt-1 min-w-[210px] rounded-[14px] border border-border bg-surface p-1.5 shadow-lg animate-[pop_.13s_cubic-bezier(.2,.8,.2,1)]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center gap-2.5 border-b border-border px-2.5 pb-2 pt-1">
        <AppAvatar name={roomName} src={roomAvatar} size={34} square />
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-extrabold">
            {roomName}
          </div>
          <div className="text-[11.5px] font-semibold text-muted">
            @{user.username}
          </div>
        </div>
      </div>
      {items.map((it) => (
        <button
          key={it.label}
          className={`flex w-full cursor-pointer items-center gap-[11px] rounded-[9px] px-3 py-2.5 text-left text-[13.5px] font-extrabold transition-colors duration-150 ease-app hover:bg-surface-2 disabled:cursor-default disabled:opacity-55 ${
            it.danger ? "text-danger" : "text-fg"
          }`}
          onClick={it.onClick}
          disabled={it.disabled}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  );
}
