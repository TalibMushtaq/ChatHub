"use client";

// Members sidebar for a room channel: members grouped by role (OWNER → ADMIN →
// MODERATOR → MEMBER) with live presence dots, clickable avatar/name links, a
// mute indicator, and a context menu for member management (Phase 4 §8). Renders
// as a right-hand column on desktop and a bottom sheet on mobile.
import { useState } from "react";
import { useShell } from "../state";
import { AvatarLink, NameLink } from "../UserLinks";
import { CloseIcon, MoreIcon } from "../icons";
import {
  chipAdmin,
  chipMember,
  chipModerator,
  chipOwner,
  btnPrimary,
} from "../styles";
import { MemberContextMenu, type MenuPosition } from "./MemberContextMenu";
import type { RoomMember, RoomRole } from "../types";

const ROLE_ORDER: {
  role: RoomRole;
  label: string;
  chip: string;
}[] = [
  { role: "OWNER", label: "Owners", chip: chipOwner },
  { role: "ADMIN", label: "Admins", chip: chipAdmin },
  { role: "MODERATOR", label: "Moderators", chip: chipModerator },
  { role: "MEMBER", label: "Members", chip: chipMember },
];

export function MemberSidebar({
  roomId,
  open,
  onClose,
}: {
  roomId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { roomMembers, presence, user, active, openModal } = useShell();
  const members = roomMembers[roomId] ?? [];
  // Role chip is shown under the group header; the current user's role drives
  // which management actions appear in the per-member context menu.
  const myRole =
    active?.kind === "room" && active.id === roomId ? active.myRole : undefined;
  const [menu, setMenu] = useState<{
    member: RoomMember;
    position: MenuPosition;
  } | null>(null);

  const groups = ROLE_ORDER.map((g) => ({
    ...g,
    list: members
      .filter((m) => m.role === g.role)
      .sort((a, b) =>
        (a.user.displayName ?? a.user.username).localeCompare(
          b.user.displayName ?? b.user.username,
        ),
      ),
  })).filter((g) => g.list.length > 0);

  function openMenu(e: React.MouseEvent, member: RoomMember) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ member, position: { x: e.clientX, y: e.clientY } });
  }

  return (
    <>
      {/* Mobile scrim */}
      <div
        className={`fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`flex min-h-0 flex-col border-l border-border bg-surface transition-transform duration-[260ms] ease-app md:pointer-events-auto md:relative md:z-auto md:w-[260px] md:translate-x-0 md:transition-none ${
          open
            ? "fixed inset-y-0 right-0 z-50 w-[300px] max-w-[85vw] translate-x-0"
            : "pointer-events-none fixed inset-y-0 right-0 z-50 w-[300px] max-w-[85vw] translate-x-full md:hidden"
        }`}
        aria-hidden={!open}
      >
        <div className="members-head flex items-center gap-2 border-b border-border px-4 py-3">
          <h3 className="min-w-0 flex-1 truncate text-[14px] font-extrabold">
            Members — {members.length}
          </h3>
          <button
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors duration-150 ease-app hover:bg-surface-2 hover:text-fg md:hidden"
            onClick={onClose}
            aria-label="Close member list"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="members min-h-0 flex-1 overflow-y-auto p-2.5">
          {members.length === 0 && (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <p className="text-[13px] font-extrabold text-fg">
                No members yet
              </p>
              <p className="text-[12px] text-muted">
                Invite people to start building this community.
              </p>
              {(myRole === "OWNER" || myRole === "ADMIN") && (
                <button
                  className={`${btnPrimary} min-h-8 px-[13px] py-[5px] text-[12.5px]`}
                  onClick={() => openModal("invite", { roomId })}
                >
                  Invite People
                </button>
              )}
            </div>
          )}
          {groups.map((g) => (
            <div key={g.role} className="mb-3">
              <div className="mb-1 flex items-center gap-1.5 px-1.5 text-[11.5px] font-extrabold tracking-[0.06em] text-muted uppercase">
                <span className={`${g.chip} !text-[10px]`}>
                  {g.list.length}
                </span>
                {g.label}
              </div>
              {g.list.map((m) => {
                const display =
                  m.nickname || m.user.displayName || m.user.username;
                return (
                  <div
                    key={m.memberId}
                    className="group/member flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 hover:bg-surface-2"
                    onContextMenu={(e) => openMenu(e, m)}
                  >
                    <AvatarLink
                      userId={m.user.id}
                      name={display}
                      avatar={m.user.avatar}
                      size={34}
                      square
                      presence={presence[m.user.id]}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-bold">
                        <NameLink
                          userId={m.user.id}
                          name={display}
                          className="text-[13px] font-bold"
                        />
                        {m.mutedUntil && (
                          <span
                            className="ml-1.5 text-[10px] font-extrabold text-danger"
                            title="Muted"
                          >
                            🔇
                          </span>
                        )}
                        {m.user.id === user.id && (
                          <span className="text-[11px] font-extrabold text-muted">
                            {" "}
                            (you)
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[11px] font-semibold text-muted">
                        @{m.user.username}
                      </div>
                    </div>
                    <button
                      className="flex h-6 w-6 flex-none items-center justify-center rounded-lg text-muted opacity-0 transition-opacity duration-150 ease-app hover:bg-surface-3 hover:text-fg group-hover/member:opacity-100"
                      onClick={(e) => openMenu(e, m)}
                      aria-label={`Member options for ${display}`}
                    >
                      <MoreIcon className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </aside>
      {menu && (
        <MemberContextMenu
          roomId={roomId}
          member={menu.member}
          myRole={myRole as RoomRole | undefined}
          position={menu.position}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}
