"use client";

// Members sidebar for a room channel: members grouped by role (OWNER → ADMIN →
// MEMBER) with live presence dots and clickable avatar/name links. Renders as a
// right-hand column on desktop and a bottom sheet on mobile.
import { useShell } from "../state";
import { displayName } from "../helpers";
import { AvatarLink, NameLink } from "../UserLinks";
import { CloseIcon } from "../icons";
import { chipAdmin, chipMember, chipOwner } from "../styles";

const ROLE_ORDER: {
  role: "OWNER" | "ADMIN" | "MEMBER";
  label: string;
  chip: string;
}[] = [
  { role: "OWNER", label: "Owners", chip: chipOwner },
  { role: "ADMIN", label: "Admins", chip: chipAdmin },
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
  const { roomMembers, presence, user } = useShell();
  const members = roomMembers[roomId] ?? [];
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
          {groups.map((g) => (
            <div key={g.role} className="mb-3">
              <div className="mb-1 flex items-center gap-1.5 px-1.5 text-[11.5px] font-extrabold tracking-[0.06em] text-muted uppercase">
                <span className={`${g.chip} !text-[10px]`}>
                  {g.list.length}
                </span>
                {g.label}
              </div>
              {g.list.map((m) => (
                <div
                  key={m.memberId}
                  className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 hover:bg-surface-2"
                >
                  <AvatarLink
                    userId={m.user.id}
                    name={m.user.displayName ?? m.user.username}
                    avatar={m.user.avatar}
                    size={34}
                    square
                    presence={presence[m.user.id]}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold">
                      <NameLink
                        userId={m.user.id}
                        name={displayName(m.user)}
                        className="text-[13px] font-bold"
                      />
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
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
