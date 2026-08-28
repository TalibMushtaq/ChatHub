"use client";

import { useState, useRef, useEffect } from "react";
import { useShell } from "../state";
import { useCallStore } from "../callStore";
import { useCallCtx } from "../CallProvider";
import { Mic, MicOff, PhoneOff, MonitorUp, Loader2, X } from "lucide-react";
import { iconBtn } from "../styles";
import ParticipantTile from "./ParticipantTile";
import { useFocusTrap } from "../useFocusTrap";

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
    <span className="tabular-nums text-[10px] text-muted font-mono ml-auto">
      {h > 0 ? `${h}:` : ""}
      {String(m).padStart(2, "0")}:{String(sec).padStart(2, "0")}
    </span>
  );
}

export default function WidgetMobileDocked({
  roomId,
  channelId,
}: {
  roomId: string;
  channelId: string;
}) {
  const { roomList, roomDetails } = useShell();
  const {
    toggleMute,
    leaveCall,
    localParticipant,
    remoteParticipants,
    speakerIdentity,
  } = useCallCtx();
  const { isMuted, connectionState, isScreenSharing } = useCallStore();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Trap keyboard focus inside the bottom sheet while it's open so users
  // can't Tab behind it into the page.
  const sheetRef = useFocusTrap<HTMLDivElement>(sheetOpen);

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

  // Swipe detection for bottom sheet
  const touchStart = useRef(0);
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches[0]) {
      touchStart.current = e.touches[0].clientY;
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (e.changedTouches[0]) {
      const dy = e.changedTouches[0].clientY - touchStart.current;
      if (dy > 60) setSheetOpen(false);
    }
  }

  const allParticipants = [
    ...(localParticipant ? [localParticipant] : []),
    ...remoteParticipants,
  ];

  return (
    <>
      {/* Docked Bar — inert while the sheet is open so it's removed from the
          tab order and the accessibility tree when hidden off-screen. */}
      <div
        className="fixed inset-x-0 z-[19] bg-surface border-t border-border px-3 py-2 flex items-center gap-2 shadow-[0_-4px_16px_rgba(0,0,0,0.05)] transition-transform duration-300"
        style={{
          bottom: "calc(70px + env(safe-area-inset-bottom))",
          transform: sheetOpen ? "translateY(150%)" : "translateY(0)",
        }}
        role="region"
        aria-label="Active call"
        inert={sheetOpen}
      >
        <button
          className="flex-1 text-left flex items-center gap-2 min-w-0"
          onClick={() => setSheetOpen(true)}
        >
          <div className={`w-2 h-2 rounded-full flex-none ${dotClass}`} />
          <span className="text-xs font-extrabold truncate">
            {channelName} · {roomName}
          </span>
          <CallTimer />
        </button>

        <button
          onClick={toggleMute}
          aria-pressed={isMuted}
          aria-label={isMuted ? "Unmute" : "Mute"}
          className={`${iconBtn} p-2 rounded-full flex-none ${isMuted ? "bg-danger-soft text-danger" : ""}`}
        >
          {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
        </button>

        <button
          onClick={leaveCall}
          className="p-2 rounded-full bg-danger text-white flex-none hover:bg-danger/80 ml-1"
          aria-label="Leave call"
        >
          <PhoneOff size={14} />
        </button>
      </div>

      {/* Scrim */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-[79] bg-black/45 transition-opacity"
          onClick={() => setSheetOpen(false)}
        />
      )}

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Active call in ${channelName}`}
        className={`fixed inset-x-0 bottom-0 z-[80] bg-surface rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out flex flex-col max-h-[85vh] ${
          sheetOpen ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Swipe handle */}
        <div className="flex justify-center py-3 flex-none cursor-grab active:cursor-grabbing">
          <div className="w-10 h-1.5 rounded-full bg-border" />
        </div>

        <div className="px-4 pb-2 flex items-center gap-2 flex-none">
          <Mic size={14} className="text-accent flex-none" />
          <span className="text-sm font-extrabold truncate flex-1">
            {channelName}
          </span>
          <span className="text-xs text-muted">{roomName}</span>
          {/* Keyboard/screen-reader close affordance — scrim + swipe are the
              only other ways to dismiss the sheet. */}
          <button
            onClick={() => setSheetOpen(false)}
            className="p-1.5 rounded-full hover:bg-surface-2 transition-colors"
            aria-label="Close call panel"
          >
            <X size={16} />
          </button>
        </div>

        {isScreenSharing && (
          <div className="mx-4 mb-2 px-3 py-1.5 bg-success-wash text-success text-xs font-bold flex items-center gap-2 rounded-lg flex-none">
            <MonitorUp size={12} />
            You&apos;re sharing your screen
          </div>
        )}

        {/* Tile Grid */}
        <div className="px-4 pb-4 flex-1 overflow-auto flex flex-col gap-2 min-h-[30vh]">
          {allParticipants.length === 0 &&
            connectionState === "reconnecting" && (
              <div className="flex-1 flex flex-col items-center justify-center text-warning gap-2">
                <Loader2 size={24} className="animate-spin" />
                <span className="text-sm font-bold">Reconnecting…</span>
              </div>
            )}
          {allParticipants.map((p) => (
            <div key={p.identity} className="h-48 flex-none">
              <ParticipantTile
                participant={p}
                isLocal={p === localParticipant}
                isSpeaking={p.identity === speakerIdentity}
                displayName={p.name ?? p.identity}
                avatarUrl={null}
              />
            </div>
          ))}
        </div>

        {/* Full Controls */}
        <div className="px-4 py-3 flex items-center justify-center gap-3 border-t border-border flex-none">
          <button
            onClick={toggleMute}
            className={`${iconBtn} p-3.5 rounded-full ${isMuted ? "bg-danger-soft text-danger" : "bg-surface-2"}`}
            aria-label={isMuted ? "Unmute" : "Mute"}
            aria-pressed={isMuted}
          >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          <button
            onClick={leaveCall}
            className="p-3.5 rounded-full bg-danger text-white ml-4 shadow-lg shadow-danger/20"
            aria-label="Leave call"
          >
            <PhoneOff size={18} />
          </button>
        </div>
      </div>
    </>
  );
}
