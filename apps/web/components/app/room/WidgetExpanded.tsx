"use client";

import { useState, useEffect } from "react";
import { useCallStore } from "../callStore";
import { useCallCtx } from "../CallProvider";
import { useShell } from "../state";
import { Track } from "livekit-client";
import ParticipantTile from "./ParticipantTile";
import {
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  X,
  Loader2,
  Video,
  VideoOff,
  Settings,
  ExternalLink,
} from "lucide-react";
import { iconBtn } from "../styles";

export default function WidgetExpanded({
  roomId,
  channelId,
}: {
  roomId: string;
  channelId: string;
}) {
  const { roomList, roomDetails } = useShell();
  const {
    localParticipant,
    remoteParticipants,
    speakerIdentity,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
    leaveCall,
  } = useCallCtx();
  const {
    isMuted,
    isDeafened,
    isCameraEnabled,
    isScreenSharing,
    setWidgetExpanded,
    connectionState,
    setDeviceSettingsOpen,
  } = useCallStore();

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

  const allParticipants = [
    ...(localParticipant ? [localParticipant] : []),
    ...remoteParticipants,
  ];

  // Auto-detect screen share
  const hasScreenShare =
    remoteParticipants.some((p) =>
      p
        .getTrackPublications()
        .some((t) => t.source === Track.Source.ScreenShare && t.track),
    ) ||
    localParticipant
      ?.getTrackPublications()
      .some((t) => t.source === Track.Source.ScreenShare && t.track);

  const [pinnedScreenShare, setPinnedScreenShare] = useState(hasScreenShare);
  useEffect(() => {
    if (hasScreenShare) setPinnedScreenShare(true);
  }, [hasScreenShare]);

  const supportsDocPiP =
    typeof window !== "undefined" && "documentPictureInPicture" in window;

  async function openDocPiP() {
    if (!supportsDocPiP) return;
    try {
      // @ts-expect-error - documentPictureInPicture is not fully typed yet
      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 640,
        height: 360,
      });
      // In a real implementation we'd mount a React portal into pipWindow.document.body
      // This is a stub for the progressive enhancement
      pipWindow.document.body.innerHTML =
        "<div style='display:flex;align-items:center;justify-content:center;height:100vh;background:#000;color:#fff;font-family:sans-serif;'>PiP Window Active</div>";
    } catch (e) {
      console.error(e);
    }
  }

  // Grid sizing
  const gridCols =
    allParticipants.length <= 1
      ? "grid-cols-1"
      : allParticipants.length <= 4
        ? "grid-cols-2"
        : "grid-cols-3";

  return (
    <div className="flex flex-col relative overflow-hidden rounded-2xl bg-surface shadow-2xl h-[420px]">
      {connectionState === "reconnecting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/80 rounded-2xl z-20">
          <Loader2 size={24} className="animate-spin text-warning mr-2" />
          <span className="text-sm font-bold">Reconnecting…</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border cursor-grab active:cursor-grabbing bg-surface relative z-10 flex-none">
        <Mic size={14} className="text-accent flex-none" />
        <span className="text-xs font-extrabold truncate flex-1">
          {channelName} · {roomName}
        </span>
        {supportsDocPiP && (
          <button
            onClick={openDocPiP}
            className={`${iconBtn} text-xs px-2 py-1 mr-1 rounded`}
            title="Pop out"
          >
            <ExternalLink size={12} className="mr-1" /> Pop out
          </button>
        )}
        <button
          onClick={() => setWidgetExpanded(false)}
          aria-label="Collapse call"
          title="Collapse"
          className={`${iconBtn} p-1 rounded-full`}
        >
          <X size={16} />
        </button>
      </div>

      {isScreenSharing && (
        <div className="px-3 py-1.5 bg-success-wash text-success text-xs font-bold flex items-center gap-2 flex-none z-10 cursor-default">
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

      {/* Grid */}
      <div
        className={`flex-1 overflow-auto p-3 flex flex-col gap-2 ${pinnedScreenShare ? "" : "grid " + gridCols} auto-rows-fr max-h-[340px]`}
      >
        {allParticipants.map((p) => {
          const isLocal = p === localParticipant;
          const isSharing = p
            .getTrackPublications()
            .some((t) => t.source === Track.Source.ScreenShare && t.track);

          if (pinnedScreenShare && !isSharing) {
            // In pinned mode, non-sharing participants could be shown in a strip below,
            // but for simplicity in the widget we just show the active screenshare and
            // maybe local participant if they aren't the sharer.
            if (!isLocal) return null;
          }

          return (
            <div
              key={p.identity}
              className={pinnedScreenShare ? "flex-1 min-h-0" : ""}
            >
              <ParticipantTile
                participant={p}
                isLocal={isLocal}
                isSpeaking={p.identity === speakerIdentity}
                displayName={p.name ?? p.identity}
                avatarUrl={null}
              />
            </div>
          );
        })}
      </div>

      {/* Controls Footer */}
      <div className="flex items-center justify-center gap-2 px-3 py-2 border-t border-border bg-surface flex-none z-10 cursor-grab active:cursor-grabbing">
        <button
          onClick={toggleMute}
          aria-pressed={isMuted}
          aria-label={isMuted ? "Unmute (Ctrl+Shift+M)" : "Mute (Ctrl+Shift+M)"}
          title={isMuted ? "Unmute (Ctrl+Shift+M)" : "Mute (Ctrl+Shift+M)"}
          className={`${iconBtn} p-2 rounded-full ${isMuted ? "bg-danger-soft text-danger" : ""}`}
        >
          {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
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
          className={`${iconBtn} p-2 rounded-full ${isDeafened ? "bg-danger-soft text-danger" : ""}`}
        >
          {isDeafened ? (
            <svg
              width="16"
              height="16"
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
              width="16"
              height="16"
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
          onClick={toggleCamera}
          aria-pressed={!isCameraEnabled}
          aria-label={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
          title={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
          className={`${iconBtn} p-2 rounded-full ${!isCameraEnabled ? "bg-danger-soft text-danger" : ""}`}
        >
          {isCameraEnabled ? <Video size={16} /> : <VideoOff size={16} />}
        </button>

        <button
          onClick={toggleScreenShare}
          aria-pressed={isScreenSharing}
          title={isScreenSharing ? "Stop sharing" : "Share screen"}
          className={`${iconBtn} p-2 rounded-full ${isScreenSharing ? "bg-success-wash text-success" : ""}`}
        >
          <MonitorUp size={16} />
        </button>

        <button
          onClick={() => setDeviceSettingsOpen(true)}
          title="Device settings"
          className={`${iconBtn} p-2 rounded-full`}
        >
          <Settings size={16} />
        </button>

        <button
          onClick={leaveCall}
          className="p-2 rounded-full bg-danger text-white hover:bg-danger/80 ml-2"
          aria-label="Leave call"
          title="Leave call"
        >
          <PhoneOff size={16} />
        </button>
      </div>
    </div>
  );
}
