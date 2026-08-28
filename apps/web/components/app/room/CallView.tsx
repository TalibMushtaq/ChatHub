"use client";

import { useCallback, useState } from "react";
import { useCallStore } from "../callStore";
import ParticipantTile from "./ParticipantTile";
import CallControlsBar from "./CallControlsBar";
import DeviceSettingsModal from "./DeviceSettingsModal";
import { PhoneOff, Mic, Loader2 } from "lucide-react";
import { btnPrimary } from "../styles";

import { useCallCtx } from "../CallProvider";

// Full call view for a voice channel. Replaces ChannelMessageArea when
// channel.type === VOICE. Connects to LiveKit, manages participants,
// and renders the adaptive grid + controls.

interface CallViewProps {
  roomId: string;
  channelId: string;
  channelName: string;
}

export default function CallView({
  roomId,
  channelId,
  channelName,
}: CallViewProps) {
  const {
    localParticipant,
    remoteParticipants,
    speakerIdentity,
    joinCall,
    leaveCall,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
  } = useCallCtx();

  const {
    isConnected,
    isJoining,
    isDeviceSettingsOpen,
    setDeviceSettingsOpen,
  } = useCallStore();

  const [error, setError] = useState<string | null>(null);

  const handleJoin = useCallback(async () => {
    // Clear the previous error so the loading state shows while retrying.
    setError(null);
    try {
      await joinCall(roomId, channelId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to join call");
    }
  }, [joinCall, roomId, channelId]);

  // --- Render ---

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <div className="text-danger font-bold">Call Error</div>
        <div className="text-[13px] text-muted">{error}</div>
        <button onClick={handleJoin} className={btnPrimary}>
          Try Again
        </button>
      </div>
    );
  }

  if (!isConnected && !isJoining) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center px-4 max-w-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-2xl text-muted mb-2">
          <PhoneOff size={28} />
        </div>
        <div>
          <p className="font-extrabold text-fg text-lg">No one&apos;s here</p>
          <p className="mt-1 text-[13px] text-muted">
            Be the first to join the call and start the conversation.
          </p>
        </div>
        <button onClick={handleJoin} className={btnPrimary}>
          Join Voice Channel
        </button>
      </div>
    );
  }

  if (isJoining) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 size={24} className="animate-spin text-accent" />
        <div className="text-sm text-muted">Joining {channelName}...</div>
      </div>
    );
  }

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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Mic size={16} className="text-accent" />
        <span className="font-extrabold text-sm">{channelName}</span>
        <span className="text-xs text-muted ml-1">
          {allParticipants.length} in call
        </span>
      </div>

      {/* Grid */}
      <div
        className={`flex-1 grid ${gridCols} gap-3 p-4 auto-rows-fr overflow-auto`}
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
      <CallControlsBar
        onLeave={leaveCall}
        onToggleMute={toggleMute}
        onToggleDeafen={toggleDeafen}
        onToggleCamera={toggleCamera}
        onToggleScreenShare={toggleScreenShare}
        onOpenSettings={() => setDeviceSettingsOpen(true)}
      />

      {/* Device settings modal */}
      {isDeviceSettingsOpen && (
        <DeviceSettingsModal onClose={() => setDeviceSettingsOpen(false)} />
      )}
    </div>
  );
}
