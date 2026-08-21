"use client";

import { useCallStore } from "../callStore";
import { MicOff, User } from "lucide-react";

// Voice channel participant list shown in the member sidebar.
// Renders avatar + name + muted indicator for each active participant.

export default function VoiceChannelSidebar() {
  const participants = useCallStore((s) => s.participants);

  if (participants.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-muted">
        No one is in the voice channel yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-2">
      <h4 className="px-2 py-1.5 text-xs font-extrabold text-muted uppercase tracking-wide">
        In Voice — {participants.length}
      </h4>
      {participants.map((p) => (
        <div
          key={p.userId}
          className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-2 transition-colors"
        >
          {p.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.avatar}
              alt={p.displayName ?? p.username}
              className="w-7 h-7 rounded-full object-cover flex-none"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center flex-none">
              <User size={14} className="text-muted" />
            </div>
          )}
          <span className="truncate text-sm font-semibold flex-1">
            {p.displayName ?? p.username}
          </span>
          {p.isMuted && <MicOff size={12} className="text-danger flex-none" />}
        </div>
      ))}
    </div>
  );
}
