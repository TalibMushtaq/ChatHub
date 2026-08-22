"use client";

import AppAvatar from "./AppAvatar";
import type { CallParticipant } from "./callStore";

export function AvatarStack({
  participants,
  max = 4,
  size = 20,
}: {
  participants: CallParticipant[];
  max?: number;
  size?: number;
}) {
  const shown = participants.slice(0, max);
  const overflow = participants.length - max;
  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <AppAvatar
          key={p.userId}
          name={p.displayName ?? p.username}
          src={p.avatar}
          size={size}
          className={i > 0 ? "-ml-1.5" : ""}
        />
      ))}
      {overflow > 0 && (
        <span className="ml-1 text-[10px] text-muted font-bold">
          +{overflow}
        </span>
      )}
    </div>
  );
}
