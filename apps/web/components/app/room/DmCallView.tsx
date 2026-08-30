"use client";

import { useCallStore } from "../callStore";
import { useCallCtx } from "../CallProvider";
import ParticipantTile from "./ParticipantTile";
import DeviceSettingsModal from "./DeviceSettingsModal";
import {
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Settings,
  Video,
  VideoOff,
} from "lucide-react";
import { iconBtn } from "../styles";

// Full call view for an active direct-message voice/video call. Rendered inside
// the DM thread (replacing the message list) once the call connects, so a
// connected call shows the participant grid + controls instead of nothing.
// Unlike CallView (room calls), there is no join step — CallProvider already
// connected to LiveKit during initiate/accept.

interface DmCallViewProps {
  callType: "VOICE" | "VIDEO";
  partnerName: string;
}

export default function DmCallView({ callType, partnerName }: DmCallViewProps) {
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
    isDeviceSettingsOpen,
    setDeviceSettingsOpen,
  } = useCallStore();

  const allParticipants = [
    ...(localParticipant ? [localParticipant] : []),
    ...remoteParticipants,
  ];

  const gridCols =
    allParticipants.length <= 1
      ? "grid-cols-1"
      : allParticipants.length <= 4
        ? "grid-cols-2"
        : "grid-cols-3";

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Video size={16} className="text-accent" />
        <span className="font-extrabold text-sm">
          {callType === "VIDEO" ? "Video" : "Voice"} call · {partnerName}
        </span>
        <span className="text-xs text-muted ml-1">
          {allParticipants.length} in call
        </span>
      </div>

      {/* Participant grid */}
      <div
        className={`flex-1 grid ${gridCols} gap-3 p-4 auto-rows-fr overflow-auto min-h-0`}
      >
        {allParticipants.map((p) => {
          const isLocal = p === localParticipant;
          return (
            <ParticipantTile
              key={p.identity}
              participant={p}
              isLocal={isLocal}
              isSpeaking={p.identity === speakerIdentity}
              displayName={p.name ?? p.identity}
              avatarUrl={null}
            />
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 px-3 py-2 border-t border-border bg-surface flex-none">
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

        {callType === "VIDEO" && (
          <button
            onClick={toggleCamera}
            aria-pressed={!isCameraEnabled}
            aria-label={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
            title={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
            className={`${iconBtn} p-2 rounded-full ${!isCameraEnabled ? "bg-danger-soft text-danger" : ""}`}
          >
            {isCameraEnabled ? <Video size={16} /> : <VideoOff size={16} />}
          </button>
        )}

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

      {/* Device settings modal */}
      {isDeviceSettingsOpen && (
        <DeviceSettingsModal onClose={() => setDeviceSettingsOpen(false)} />
      )}
    </div>
  );
}
