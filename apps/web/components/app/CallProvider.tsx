"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useState,
} from "react";
import { Room, RoomEvent, Track, Participant } from "livekit-client";
import { useCallStore } from "./callStore";
import { CallAPI } from "./api";
import { buildMediaConstraints } from "./useDeviceManager";

export interface CallCtx {
  joinCall: (roomId: string, channelId: string) => Promise<void>;
  leaveCall: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  localParticipant: Participant | null;
  remoteParticipants: Participant[];
  speakerIdentity: string | null;
}

export const CallContext = createContext<CallCtx | null>(null);

export function useCallCtx(): CallCtx {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCallCtx must be used within <CallProvider>");
  return ctx;
}

export default function CallProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const lkRoomRef = useRef<Room | null>(null);
  const [localParticipant, setLocalParticipant] = useState<Participant | null>(
    null,
  );
  const [remoteParticipants, setRemoteParticipants] = useState<Participant[]>(
    [],
  );
  const [speakerIdentity, setSpeakerIdentity] = useState<string | null>(null);

  const {
    setJoining,
    setConnected,
    setConnectionState,
    setScreenSharing,
    setParticipants,
    setActiveCall,
    clearActiveCall,
    setCallStartedAt,
    setMuted,
    setCameraEnabled,
  } = useCallStore();

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

      setParticipants([...locals, ...remotes]);
      setLocalParticipant(room.localParticipant ?? null);
      setRemoteParticipants(Array.from(room.remoteParticipants.values()));
    },
    [setParticipants],
  );

  const joinCall = useCallback(
    async (roomId: string, channelId: string) => {
      // Single call constraint
      if (lkRoomRef.current) {
        await lkRoomRef.current.disconnect();
        lkRoomRef.current = null;
        clearActiveCall();
      }

      setJoining(true);

      try {
        const { token, livekitUrl, sessionId } = await CallAPI.joinToken(
          roomId,
          channelId,
        );

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        });

        room.on(RoomEvent.Connected, () => {
          setConnected(true);
          setJoining(false);
          setCallStartedAt(Date.now());
          syncParticipants(room);
        });

        room.on(RoomEvent.Disconnected, () => {
          setConnected(false);
          clearActiveCall();
          lkRoomRef.current = null;
        });

        room.on(RoomEvent.Reconnecting, () =>
          setConnectionState("reconnecting"),
        );
        room.on(RoomEvent.Reconnected, () => setConnectionState("connected"));

        room.on(RoomEvent.ParticipantConnected, () => syncParticipants(room));
        room.on(RoomEvent.ParticipantDisconnected, () =>
          syncParticipants(room),
        );
        room.on(RoomEvent.TrackSubscribed, () => syncParticipants(room));
        room.on(RoomEvent.TrackUnsubscribed, () => syncParticipants(room));

        room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
          if (pub.source === Track.Source.ScreenShare) setScreenSharing(false);
          syncParticipants(room);
        });

        const lastSpeakRef = { t: 0 };
        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          const now = Date.now();
          if (now - lastSpeakRef.t < 150) return;
          lastSpeakRef.t = now;
          syncParticipants(room);
          setSpeakerIdentity(speakers[0]?.identity ?? null);
        });

        await room.connect(livekitUrl, token);

        const sMic = useCallStore.getState().selectedMicrophone;
        const constraints = buildMediaConstraints({
          audio: true,
          microphoneId: sMic,
        });
        await room.localParticipant.setMicrophoneEnabled(
          true,
          typeof constraints.audio === "object" ? constraints.audio : undefined,
        );

        lkRoomRef.current = room;
        setActiveCall(sessionId, channelId, roomId);
        syncParticipants(room);
      } catch (err) {
        console.error("Failed to join call", err);
        setJoining(false);
      }
    },
    [
      clearActiveCall,
      setJoining,
      setConnected,
      setCallStartedAt,
      setConnectionState,
      setScreenSharing,
      syncParticipants,
      setActiveCall,
    ],
  );

  const leaveCall = useCallback(async () => {
    const room = lkRoomRef.current;
    if (room) {
      await room.disconnect();
      lkRoomRef.current = null;
    }
    const state = useCallStore.getState();
    if (state.activeRoomId && state.activeChannelId) {
      try {
        await CallAPI.leave(state.activeRoomId, state.activeChannelId);
      } catch {
        // Best-effort
      }
    }
    clearActiveCall();
  }, [clearActiveCall]);

  const toggleMute = useCallback(async () => {
    const room = lkRoomRef.current;
    if (!room?.localParticipant) return;
    const currentMuted = useCallStore.getState().isMuted;
    const newMuted = !currentMuted;
    await room.localParticipant.setMicrophoneEnabled(!newMuted);
    setMuted(newMuted);
    syncParticipants(room);
  }, [setMuted, syncParticipants]);

  const toggleDeafen = useCallback(async () => {
    const room = lkRoomRef.current;
    if (!room?.localParticipant) return;
    const newDeafened = !useCallStore.getState().isDeafened;
    if (newDeafened) {
      await room.localParticipant.setMicrophoneEnabled(false);
      setMuted(true);
    }
    useCallStore.getState().setDeafened(newDeafened);
    syncParticipants(room);
  }, [setMuted, syncParticipants]);

  const toggleCamera = useCallback(async () => {
    const room = lkRoomRef.current;
    if (!room?.localParticipant) return;
    const currentCam = useCallStore.getState().isCameraEnabled;
    const sCam = useCallStore.getState().selectedCamera;
    const newEnabled = !currentCam;
    await room.localParticipant.setCameraEnabled(
      newEnabled,
      sCam ? { deviceId: sCam } : undefined,
    );
    setCameraEnabled(newEnabled);
    syncParticipants(room);
  }, [setCameraEnabled, syncParticipants]);

  const toggleScreenShare = useCallback(async () => {
    const room = lkRoomRef.current;
    if (!room?.localParticipant) return;
    const currentShare = useCallStore.getState().isScreenSharing;
    if (currentShare) {
      await room.localParticipant.setScreenShareEnabled(false);
      setScreenSharing(false);
    } else {
      try {
        await room.localParticipant.setScreenShareEnabled(true);
        setScreenSharing(true);
      } catch {
        // User cancelled or permission denied
      }
    }
    syncParticipants(room);
  }, [setScreenSharing, syncParticipants]);

  useEffect(() => {
    return () => {
      lkRoomRef.current?.disconnect();
      lkRoomRef.current = null;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        if (e.key === "M" || e.key === "m") {
          e.preventDefault();
          toggleMute();
        }
        if (e.key === "D" || e.key === "d") {
          e.preventDefault();
          toggleDeafen();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMute, toggleDeafen]);

  return (
    <CallContext.Provider
      value={{
        joinCall,
        leaveCall,
        toggleMute,
        toggleDeafen,
        toggleCamera,
        toggleScreenShare,
        localParticipant,
        remoteParticipants,
        speakerIdentity,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}
