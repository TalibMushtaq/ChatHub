"use client";

// Member context menu (Phase 4 §8.3): opened from a member row's "⋯" button or
// right-click. Items are permission-gated by the current user's role; destructive
// actions (kick/ban) and timed mutes route through the shared confirm / action
// modals, and the server remains the authorization authority.
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useShell } from "../state";
import type { RoomMember, RoomRole } from "../types";
import {
  UserIcon,
  EditIcon,
  MicIcon,
  LogoutIcon,
  TrashIcon,
  CheckIcon,
} from "../icons";
import { MenuList, type MenuItem } from "./MenuList";

export interface MenuPosition {
  x: number;
  y: number;
}

const ROLE_ORDER: Record<RoomRole, number> = {
  MEMBER: 0,
  MODERATOR: 1,
  ADMIN: 2,
  OWNER: 3,
};

const MUTE_PRESETS = [
  { label: "10 minutes", minutes: 10 },
  { label: "1 hour", minutes: 60 },
  { label: "1 day", minutes: 1440 },
  { label: "1 week", minutes: 10080 },
];

export function MemberContextMenu({
  roomId,
  member,
  myRole,
  position,
  onClose,
}: {
  roomId: string;
  member: RoomMember;
  myRole: RoomRole | undefined;
  position: MenuPosition;
  onClose: () => void;
}) {
  const { user, openModal, muteMember, unmuteMember, changeMemberRole } =
    useShell();
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

  const isSelf = member.user.id === user.id;
  const myLevel = ROLE_ORDER[myRole ?? "MEMBER"] ?? 0;
  const targetLevel = ROLE_ORDER[member.role];
  const isOwner = member.role === "OWNER";
  // Member management (kick/ban/mute/role) needs MANAGE_MEMBERS, held only by
  // OWNER/ADMIN. A role can manage another only when strictly senior and the
  // target is not the owner.
  const isManager = myRole === "OWNER" || myRole === "ADMIN";
  const canManage = isManager && !isSelf && !isOwner && myLevel > targetLevel;
  // Promoting/demoting to ADMIN is owner-only.
  const canAssignAdmin = myRole === "OWNER" && !isSelf && !isOwner;
  const isMuted = !!member.mutedUntil;

  const items: MenuItem[] = [
    {
      label: "View Profile",
      icon: <UserIcon className="h-4 w-4 flex-none" />,
      onClick: () => {
        onClose();
        openModal("userProfile", { userId: member.user.id });
      },
    },
  ];

  if (isSelf) {
    items.push({
      label: "Set Nickname",
      icon: <EditIcon className="h-4 w-4 flex-none" />,
      onClick: () => {
        onClose();
        openModal("nickname", { roomId, userId: member.user.id });
      },
    });
  } else if (canManage) {
    items.push({
      label: "Set Nickname",
      icon: <EditIcon className="h-4 w-4 flex-none" />,
      onClick: () => {
        onClose();
        openModal("nickname", { roomId, userId: member.user.id });
      },
    });
  }

  // Role assignment (ADMIN only from owner; MODERATOR/MEMBER from any manager).
  if (canManage || canAssignAdmin) {
    const assign = (role: RoomRole) => () => {
      onClose();
      void changeMemberRole(roomId, member.user.id, role);
    };
    if (canAssignAdmin && member.role !== "ADMIN") {
      items.push({
        label: "Set as Admin",
        icon: <CheckIcon className="h-4 w-4 flex-none" />,
        onClick: assign("ADMIN"),
      });
    }
    if (canManage && member.role !== "MODERATOR") {
      items.push({
        label: "Set as Moderator",
        icon: <CheckIcon className="h-4 w-4 flex-none" />,
        onClick: assign("MODERATOR"),
      });
    }
    if (canManage && member.role !== "MEMBER") {
      items.push({
        label: "Set as Member",
        icon: <CheckIcon className="h-4 w-4 flex-none" />,
        onClick: assign("MEMBER"),
      });
    }
  }

  // Mute / unmute (timed) for members a role can manage.
  if (canManage && !isMuted) {
    items.push(
      ...MUTE_PRESETS.map((p) => ({
        label: `Mute ${p.label}`,
        icon: <MicIcon className="h-4 w-4 flex-none" />,
        onClick: () => {
          onClose();
          void muteMember(roomId, member.user.id, p.minutes);
        },
      })),
    );
  } else if (canManage && isMuted) {
    items.push({
      label: "Unmute",
      icon: <MicIcon className="h-4 w-4 flex-none" />,
      onClick: () => {
        onClose();
        void unmuteMember(roomId, member.user.id);
      },
    });
  }

  // Kick / ban for managers (goes through the action modal with a confirm).
  if (canManage) {
    items.push({
      label: "Kick Member",
      icon: <LogoutIcon className="h-4 w-4 flex-none" />,
      onClick: () => {
        onClose();
        openModal("memberAction", { roomId, member, action: "kick" });
      },
    });
    items.push({
      label: "Ban Member",
      icon: <TrashIcon className="h-4 w-4 flex-none" />,
      danger: true,
      onClick: () => {
        onClose();
        openModal("memberAction", { roomId, member, action: "ban" });
      },
    });
  }

  const style = {
    top: Math.min(
      position.y,
      (typeof window !== "undefined" ? window.innerHeight : 0) - 320,
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
      className="fixed z-[95] min-w-[215px] max-h-[80vh] overflow-y-auto rounded-[14px] border border-border bg-surface p-0 shadow-lg animate-[pop_.13s_cubic-bezier(.2,.8,.2,1)]"
    >
      <MenuList items={items} />
    </div>,
    document.body,
  );
}
