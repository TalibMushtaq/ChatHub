"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, Participant } from "livekit-client";
import { useCallStore, type CallParticipant } from "../callStore";
import { CallAPI } from "../api";
import { buildMediaConstraints } from "../useDeviceManager";
import ParticipantTile from "./ParticipantTile";
import CallControlsBar from "./CallControlsBar";
import DeviceSettingsModal from "./DeviceSettingsModal";
import { Mic, Loader2 } from "lucide-react";
import { btnPrimary } from "../styles";

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
  const roomRef = useRef<Room | null>(null);

  const {
    isConnected,
    isJoining,
    isMuted,
    isCameraEnabled,
    isScreenSharing,
    selectedMicrophone,
    selectedCamera,
    isDeviceSettingsOpen,
    setActiveCall,
    clearActiveCall,
    setJoining,
    setConnected,
    setMuted,
    setCameraEnabled,
    setScreenSharing,
    setDeviceSettingsOpen,
    setParticipants,
  } = useCallStore();

  const [localParticipant, setLocalParticipant] = useState<Participant | null>(
    null,
  );
  const [remoteParticipants, setRemoteParticipants] = useState<Participant[]>(
    [],
  );
  const [speakerIdentity, setSpeakerIdentity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync LiveKit participants into the store.
  const syncParticipants = useCallback(
    (room: Room) => {
      const locals = room.localParticipant
        ? [
            {
              userId: room.localParticipant.identity.replace("user:", ""),
              username: room.localParticipant.name ?? "You",
              displayName: room.localParticipant.name ?? "You",
              avatar: null,
              isMuted:
                room.localParticipant.getTrackPublication(
                  Track.Source.Microphone,
                )?.isMuted ?? true,
              isSpeaking: room.localParticipant.isSpeaking,
            },
          ]
        : [];

      const remotes = Array.from(room.remoteParticipants.values()).map((p) => ({
        userId: p.identity.replace("user:", ""),
        username: p.name ?? p.identity,
        displayName: p.name ?? p.identity,
        avatar: null,
        isMuted:
          p.getTrackPublication(Track.Source.Microphone)?.isMuted ?? true,
        isSpeaking: p.isSpeaking,
      }));

      setParticipants([...locals, ...remotes] as CallParticipant[]);
      setLocalParticipant(room.localParticipant ?? null);
      setRemoteParticipants(Array.from(room.remoteParticipants.values()));
    },
    [setParticipants],
  );

  // Join the call: get token, create LiveKit Room, connect.
  const joinCall = useCallback(async () => {
    setJoining(true);
    setError(null);

    try {
      const { token, livekitUrl, sessionId } = await CallAPI.joinToken(
        roomId,
        channelId,
      );

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      // Wire up events.
      room.on(RoomEvent.Connected, () => {
        setConnected(true);
        setJoining(false);
        syncParticipants(room);
      });

      room.on(RoomEvent.Disconnected, () => {
        setConnected(false);
        clearActiveCall();
      });

      room.on(RoomEvent.ParticipantConnected, () => syncParticipants(room));
      room.on(RoomEvent.ParticipantDisconnected, () => syncParticipants(room));
      room.on(RoomEvent.TrackSubscribed, () => syncParticipants(room));
      room.on(RoomEvent.TrackUnsubscribed, () => syncParticipants(room));
      // Local track unpublished = native "Stop sharing" screen share end.
      room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
        if (pub.source === Track.Source.ScreenShare) setScreenSharing(false);
        syncParticipants(room);
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        syncParticipants(room);
        setSpeakerIdentity(speakers[0]?.identity ?? null);
      });

      await room.connect(livekitUrl, token);

      // Publish mic track with device preferences.
      const constraints = buildMediaConstraints({
        audio: true,
        microphoneId: selectedMicrophone,
      });
      await room.localParticipant.setMicrophoneEnabled(
        true,
        typeof constraints.audio === "object" ? constraints.audio : undefined,
      );

      roomRef.current = room;
      // Use the real session ID from the server (not a placeholder string).
      setActiveCall(sessionId, channelId, roomId);
      syncParticipants(room);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to join call");
      setJoining(false);
    }
  }, [
    roomId,
    channelId,
    selectedMicrophone,
    setActiveCall,
    setJoining,
    setConnected,
    clearActiveCall,
    setScreenSharing,
    syncParticipants,
  ]);

  // Leave call: disconnect LiveKit + backend cleanup.
  const leaveCall = useCallback(async () => {
    const room = roomRef.current;
    if (room) {
      await room.disconnect();
      roomRef.current = null;
    }
    try {
      await CallAPI.leave(roomId, channelId);
    } catch {
      // Best-effort — server will reap stale participants.
    }
    clearActiveCall();
  }, [roomId, channelId, clearActiveCall]);

  // Toggle mute.
  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room?.localParticipant) return;
    const newMuted = !isMuted;
    await room.localParticipant.setMicrophoneEnabled(!newMuted);
    setMuted(newMuted);
    syncParticipants(room);
  }, [isMuted, setMuted, syncParticipants]);

  // Toggle deafen (mutes mic + disables all audio playback).
  const toggleDeafen = useCallback(async () => {
    const room = roomRef.current;
    if (!room?.localParticipant) return;
    const newDeafened = !useCallStore.getState().isDeafened;
    if (newDeafened) {
      await room.localParticipant.setMicrophoneEnabled(false);
      setMuted(true);
    }
    useCallStore.getState().setDeafened(newDeafened);
    syncParticipants(room);
  }, [setMuted, syncParticipants]);

  // Toggle camera.
  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room?.localParticipant) return;
    const newEnabled = !isCameraEnabled;
    await room.localParticipant.setCameraEnabled(
      newEnabled,
      selectedCamera ? { deviceId: selectedCamera } : undefined,
    );
    setCameraEnabled(newEnabled);
    syncParticipants(room);
  }, [isCameraEnabled, selectedCamera, setCameraEnabled, syncParticipants]);

  // Toggle screen share.
  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room?.localParticipant) return;
    if (isScreenSharing) {
      await room.localParticipant.setScreenShareEnabled(false);
      setScreenSharing(false);
    } else {
      try {
        await room.localParticipant.setScreenShareEnabled(true);
        setScreenSharing(true);
      } catch {
        // User cancelled or permission denied.
      }
    }
    syncParticipants(room);
  }, [isScreenSharing, setScreenSharing, syncParticipants]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, []);

  // Auto-join when not yet connected and not joining. The isMountedRef guard
  // prevents React StrictMode from firing two concurrent join attempts — the
  // cleanup sets it to false so the second mount sees joining is already in
  // progress and bails out.
  useEffect(() => {
    let cancelled = false;
    if (!isConnected && !isJoining && !error) {
      // Delay one microtask so the cleanup from the first mount (in StrictMode)
      // has a chance to run before the second mount's effect kicks off.
      Promise.resolve().then(() => {
        if (!cancelled) joinCall();
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Render ---

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <div className="text-danger font-bold">Call Error</div>
        <div className="text-sm text-muted">{error}</div>
        <button onClick={joinCall} className={btnPrimary}>
          Try Again
        </button>
      </div>
    );
  }

  if (isJoining || !isConnected) {
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
