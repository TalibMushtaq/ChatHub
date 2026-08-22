"use client";

import { useEffect, useState } from "react";
import { useShell } from "../state";
import { useCallStore } from "../callStore";
import { useCallCtx } from "../CallProvider";
import AppAvatar from "../AppAvatar";
import {
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Maximize2,
  Loader2,
} from "lucide-react";
import { iconBtn } from "../styles";

function CallTimer() {
  const startedAt = useCallStore((s) => s.callStartedAt);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    setElapsed(Date.now() - startedAt);
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const s = Math.floor(elapsed / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    <span className="tabular-nums text-xs text-muted font-mono">
      {h > 0 ? `${h}:` : ""}
      {String(m).padStart(2, "0")}:{String(sec).padStart(2, "0")}
    </span>
  );
}

function AvatarStack() {
  const participants = useCallStore((s) => s.participants);
  const shown = participants.slice(0, 4);
  const overflow = participants.length - 4;
  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <AppAvatar
          key={p.userId}
          name={p.displayName ?? p.username}
          src={p.avatar}
          size={20}
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

export default function WidgetMinimized({
  roomId,
  channelId,
}: {
  roomId: string;
  channelId: string;
}) {
  const { openConv, roomList, roomDetails } = useShell();
  const { toggleMute, toggleDeafen, toggleScreenShare, leaveCall } =
    useCallCtx();
  const isMuted = useCallStore((s) => s.isMuted);
  const isDeafened = useCallStore((s) => s.isDeafened);
  const setWidgetExpanded = useCallStore((s) => s.setWidgetExpanded);
  const connectionState = useCallStore((s) => s.connectionState);
  const isScreenSharing = useCallStore((s) => s.isScreenSharing);

  const room = roomList.find((r) => r.roomId === roomId);
  const roomName = room?.name ?? "Room";
  let channelName = "Voice";

  const detail = roomDetails[roomId];
  if (detail) {
    const channel =
      detail.categories
        .flatMap((c) => c.channels ?? [])
        .find((c) => c.id === channelId) ||
      detail.uncategorized.find((c) => c.id === channelId);
    if (channel) channelName = channel.name;
  }

  const dotClass =
    connectionState === "connected"
      ? "bg-success"
      : connectionState === "reconnecting" || connectionState === "connecting"
        ? "bg-warning animate-pulse"
        : "bg-danger";

  return (
    <div className="flex flex-col relative overflow-hidden rounded-2xl">
      {connectionState === "reconnecting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/80 rounded-2xl z-10">
          <Loader2 size={16} className="animate-spin text-warning mr-2" />
          <span className="text-xs font-bold">Reconnecting…</span>
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2 border-b border-border cursor-grab active:cursor-grabbing">
        <div className={`w-2 h-2 rounded-full flex-none ${dotClass}`} />
        <button
          onClick={() => openConv({ kind: "room", id: roomId, channelId })}
          className="truncate text-xs font-extrabold text-fg hover:text-accent-solid flex-1 text-left"
        >
          {channelName} · {roomName}
        </button>
        <CallTimer />
      </div>

      {isScreenSharing && (
        <div className="px-3 py-1.5 bg-success-wash text-success text-xs font-bold flex items-center gap-2 cursor-default">
          <MonitorUp size={12} />
          You&apos;re sharing —
          <button
            className="underline cursor-pointer"
            onClick={toggleScreenShare}
          >
            Stop
          </button>
        </div>
      )}

      <div className="flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-1">
          <button
            onClick={toggleMute}
            aria-pressed={isMuted}
            aria-label={
              isMuted ? "Unmute (Ctrl+Shift+M)" : "Mute (Ctrl+Shift+M)"
            }
            title={isMuted ? "Unmute (Ctrl+Shift+M)" : "Mute (Ctrl+Shift+M)"}
            className={`${iconBtn} p-1.5 rounded-full ${isMuted ? "bg-danger-soft text-danger" : ""}`}
          >
            {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
          </button>

          <button
            onClick={toggleDeafen}
            aria-pressed={isDeafened}
            aria-label={
              isDeafened ? "Undeafen (Ctrl+Shift+D)" : "Deafen (Ctrl+Shift+D)"
            }
            title={
              isDeafened ? "Undeafen (Ctrl+Shift+D)" : "Deafen (Ctrl+Shift+D)"
            }
            className={`${iconBtn} p-1.5 rounded-full ${isDeafened ? "bg-danger-soft text-danger" : ""}`}
          >
            {isDeafened ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18.36 5.64a9 9 0 0 1 0 12.73" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.08" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18.36 5.64a9 9 0 0 1 0 12.73" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.08" />
              </svg>
            )}
          </button>

          <button
            onClick={() => setWidgetExpanded(true)}
            aria-label="Expand call"
            title="Expand"
            className={`${iconBtn} p-1.5 rounded-full`}
          >
            <Maximize2 size={14} />
          </button>

          <button
            onClick={leaveCall}
            className="p-1.5 rounded-full bg-danger text-white hover:bg-danger/80 ml-1"
            aria-label="Leave call"
            title="Leave call"
          >
            <PhoneOff size={14} />
          </button>
        </div>

        <AvatarStack />
      </div>
    </div>
  );
}
