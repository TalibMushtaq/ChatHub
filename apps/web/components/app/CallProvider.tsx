"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useState,
} from "react";
import type { Participant } from "livekit-client";
import { useCallStore } from "./callStore";
import { CallAPI } from "./api";
import { buildMediaConstraints } from "./useDeviceManager";

/** Participant shape exposed to consumers of CallContext. */
interface CallParticipant {
  userId: string;
  username: string;
  displayName: string;
  avatar: null;
  isMuted: boolean;
  isSpeaking: boolean;
}

/** Minimal interface for the LiveKit Room — avoids importing the full SDK at
 *  module level so livekit-client is only loaded on first call join. */
interface LkRoom {
  disconnect(): Promise<void>;
  localParticipant: {
    identity: string;
    name?: string;
    isSpeaking: boolean;
    getTrackPublication(source: unknown): { isMuted: boolean } | undefined;
    setMicrophoneEnabled(
      enabled: boolean,
      constraints?: unknown,
    ): Promise<void>;
    setCameraEnabled(enabled: boolean, constraints?: unknown): Promise<void>;
    setScreenShareEnabled(enabled: boolean): Promise<void>;
  };
  remoteParticipants: Map<
    string,
    {
      identity: string;
      name?: string;
      isSpeaking: boolean;
      getTrackPublication(source: unknown): { isMuted: boolean } | undefined;
    }
  >;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (...args: any[]) => void): void;
  connect(url: string, token: string): Promise<void>;
}

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
  const lkRoomRef = useRef<LkRoom | null>(null);
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
    (room: LkRoom) => {
      const locals: CallParticipant[] = room.localParticipant
        ? [
            {
              userId: room.localParticipant.identity.replace("user:", ""),
              username: room.localParticipant.name ?? "You",
              displayName: room.localParticipant.name ?? "You",
              avatar: null,
              isMuted:
                room.localParticipant.getTrackPublication("microphone")
                  ?.isMuted ?? true,
              isSpeaking: room.localParticipant.isSpeaking,
            },
          ]
        : [];

      const remotes: CallParticipant[] = Array.from(
        room.remoteParticipants.values(),
      ).map((p) => ({
        userId: p.identity.replace("user:", ""),
        username: p.name ?? p.identity,
        displayName: p.name ?? p.identity,
        avatar: null,
        isMuted: p.getTrackPublication("microphone")?.isMuted ?? true,
        isSpeaking: p.isSpeaking,
      }));

      setParticipants([...locals, ...remotes]);
      // Expose raw LiveKit Participant objects to CallCtx consumers.
      // The as-cast is safe: the runtime Room's localParticipant / remoteParticipants
      // ARE the LiveKit Participant instances; LkRoom is a structural subset.
      setLocalParticipant(
        (room.localParticipant as unknown as Participant) ?? null,
      );
      setRemoteParticipants(
        Array.from(
          room.remoteParticipants.values(),
        ) as unknown as Participant[],
      );
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

        // Dynamic import: livekit-client is only loaded when a call is joined.
        const { Room, RoomEvent, Track } = await import("livekit-client");

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        }) as unknown as LkRoom;

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
