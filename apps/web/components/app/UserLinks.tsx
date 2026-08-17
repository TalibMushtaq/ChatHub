"use client";

// Clickable avatar (opens the full-screen avatar viewer) and clickable name
// (opens the profile card) as reusable elements, so every surface renders the
// same click hierarchy with no duplicated handlers.
//
// `stop`: set when the element sits inside a larger clickable row (a DM or
// search row that opens a conversation) — the click is stopped from bubbling
// so it only opens the viewer/card, never the row.
//
// `plain`: renders a bare span (mouse-only) instead of a role="button" with
// keyboard support. Used ONLY inside real <button> rows where nesting another
// interactive element would be invalid HTML; the outer button stays the
// keyboard path.
import AppAvatar from "./AppAvatar";
import { useUserActions } from "./useUserActions";
import type { PresenceInfo } from "./types";

interface AvatarLinkProps {
  userId: string;
  name?: string | null;
  avatar?: string | null;
  size?: number;
  square?: boolean;
  presence?: PresenceInfo | null;
  stop?: boolean;
  plain?: boolean;
}

export function AvatarLink({
  userId,
  name,
  avatar,
  size = 36,
  square,
  presence,
  stop,
  plain,
}: AvatarLinkProps) {
  const { openAvatar } = useUserActions();
  const display = name ?? "user";
  const handle = (e: { stopPropagation: () => void }) => {
    if (stop) e.stopPropagation();
    openAvatar(userId, name, avatar);
  };
  const common = {
    className: "inline-flex cursor-pointer align-middle",
    onClick: handle,
  };
  return (
    <span
      {...common}
      role={plain ? undefined : "button"}
      tabIndex={plain ? undefined : 0}
      aria-label={plain ? undefined : `View ${display}'s picture`}
      onKeyDown={
        plain
          ? undefined
          : (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handle(e);
              }
            }
      }
    >
      <AppAvatar
        name={display}
        src={avatar}
        size={size}
        square={square}
        presence={presence}
      />
    </span>
  );
}

interface NameLinkProps {
  userId: string;
  name: string;
  stop?: boolean;
  plain?: boolean;
  className?: string;
}

export function NameLink({
  userId,
  name,
  stop,
  plain,
  className = "",
}: NameLinkProps) {
  const { openProfile } = useUserActions();
  const handle = (e: { stopPropagation: () => void }) => {
    if (stop) e.stopPropagation();
    openProfile(userId);
  };
  const common = {
    className: `cursor-pointer ${className}`,
    onClick: handle,
  };
  return (
    <span
      {...common}
      role={plain ? undefined : "button"}
      tabIndex={plain ? undefined : 0}
      onKeyDown={
        plain
          ? undefined
          : (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handle(e);
              }
            }
      }
    >
      {name}
    </span>
  );
}
