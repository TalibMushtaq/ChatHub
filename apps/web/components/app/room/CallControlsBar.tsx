"use client";

import { useCallStore } from "../callStore";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  Settings,
  PhoneOff,
} from "lucide-react";
import { iconBtn } from "../styles";

// Call controls bar: mute, deafen, camera, screen share, settings, leave.
// Optimistic UI + reconciled with actual LiveKit state.

interface CallControlsBarProps {
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onOpenSettings: () => void;
}

export default function CallControlsBar({
  onLeave,
  onToggleMute,
  onToggleDeafen,
  onToggleCamera,
  onToggleScreenShare,
  onOpenSettings,
}: CallControlsBarProps) {
  const isMuted = useCallStore((s) => s.isMuted);
  const isDeafened = useCallStore((s) => s.isDeafened);
  const isCameraEnabled = useCallStore((s) => s.isCameraEnabled);
  const isScreenSharing = useCallStore((s) => s.isScreenSharing);

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-3 bg-bg border-t border-border">
      <button
        onClick={onToggleMute}
        className={`${iconBtn} p-2.5 rounded-full ${isMuted ? "bg-danger-soft text-danger" : ""}`}
        title={isMuted ? "Unmute" : "Mute"}
        aria-label={isMuted ? "Unmute" : "Mute"}
        aria-pressed={isMuted}
      >
        {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
      </button>

      <button
        onClick={onToggleDeafen}
        className={`${iconBtn} p-2.5 rounded-full ${isDeafened ? "bg-danger-soft text-danger" : ""}`}
        title={isDeafened ? "Undeafen" : "Deafen"}
        aria-label={isDeafened ? "Undeafen" : "Deafen"}
        aria-pressed={isDeafened}
      >
        {isDeafened ? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18.36 5.64a9 9 0 0 1 0 12.73" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.08" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ) : (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18.36 5.64a9 9 0 0 1 0 12.73" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.08" />
          </svg>
        )}
      </button>

      <button
        onClick={onToggleCamera}
        className={`${iconBtn} p-2.5 rounded-full ${!isCameraEnabled ? "bg-danger-soft text-danger" : ""}`}
        title={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
        aria-label={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
        aria-pressed={isCameraEnabled}
      >
        {isCameraEnabled ? <Video size={18} /> : <VideoOff size={18} />}
      </button>

      <button
        onClick={onToggleScreenShare}
        className={`${iconBtn} p-2.5 rounded-full ${isScreenSharing ? "bg-success-wash text-success" : ""}`}
        title={isScreenSharing ? "Stop sharing" : "Share screen"}
        aria-label={isScreenSharing ? "Stop screen sharing" : "Share screen"}
        aria-pressed={isScreenSharing}
      >
        <MonitorUp size={18} />
      </button>

      <button
        onClick={onOpenSettings}
        className={`${iconBtn} p-2.5 rounded-full`}
        title="Device settings"
        aria-label="Device settings"
      >
        <Settings size={18} />
      </button>

      <button
        onClick={onLeave}
        className="p-2.5 rounded-full bg-danger text-white hover:bg-danger/80 transition-colors ml-2"
        title="Leave call"
        aria-label="Leave call"
      >
        <PhoneOff size={18} />
      </button>
    </div>
  );
}
