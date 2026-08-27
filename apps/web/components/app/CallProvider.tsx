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
import { CallAPI, DmCallAPI } from "./api";
import type { DmCallType } from "./api";
import { socket } from "../../app/lib/socket";
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
  // Room calls
  joinCall: (roomId: string, channelId: string) => Promise<void>;
  // DM calls
  initiateDmCall: (directChatId: string, callType: DmCallType) => Promise<void>;
  acceptDmCall: (directChatId: string) => Promise<void>;
  joinDmCall: (directChatId: string) => Promise<void>;
  // Unified leave (handles both room and DM calls)
  leaveCall: () => Promise<void>;
  // Media controls
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

  // Reconnect state: tracks intentional leave vs unexpected disconnect.
  const intentionalLeaveRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectAbortRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Store the last join params so we can re-join after a disconnect.
  // Discriminated union supports both room calls and DM calls.
  const lastJoinParamsRef = useRef<
    | { type: "channel"; roomId: string; channelId: string }
    | { type: "dm"; directChatId: string }
    | null
  >(null);

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
    setActiveDmCall,
    setIncomingCallInfo,
  } = useCallStore();

  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_BASE_MS = 1000;

  /** Store the latest attemptReconnect in a ref so joinCall can reference it
   *  without a circular dependency. */
  const attemptReconnectRef = useRef<() => void>(() => {});

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
      // Cancel any in-progress reconnect attempt.
      reconnectAbortRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      reconnectAttemptRef.current = 0;
      intentionalLeaveRef.current = false;

      // Single call constraint
      if (lkRoomRef.current) {
        await lkRoomRef.current.disconnect();
        lkRoomRef.current = null;
        clearActiveCall();
      }

      setJoining(true);
      lastJoinParamsRef.current = { type: "channel", roomId, channelId };

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
          reconnectAttemptRef.current = 0;
          reconnectAbortRef.current = false;
          syncParticipants(room);
        });

        // DuplicateIdentity: another device joined with the same identity.
        room.on(RoomEvent.Disconnected, (reason) => {
          setConnected(false);
          if (intentionalLeaveRef.current || reason === "DUPLICATE_IDENTITY") {
            clearActiveCall();
            lkRoomRef.current = null;
            lastJoinParamsRef.current = null;
            return;
          }
          // Otherwise: attempt reconnect with exponential backoff.
          lkRoomRef.current = null;
          attemptReconnectRef.current();
        });

        room.on(RoomEvent.Reconnecting, () =>
          setConnectionState("reconnecting"),
        );
        room.on(RoomEvent.Reconnected, () => {
          setConnectionState("connected");
          reconnectAttemptRef.current = 0;
        });

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

  /** Initiate a DM call — creates a session, caller gets token and connects to LiveKit. */
  const initiateDmCall = useCallback(
    async (directChatId: string, callType: DmCallType) => {
      // Cancel any in-progress reconnect attempt.
      reconnectAbortRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      reconnectAttemptRef.current = 0;
      intentionalLeaveRef.current = false;

      // Single call constraint: disconnect any existing call.
      if (lkRoomRef.current) {
        await lkRoomRef.current.disconnect();
        lkRoomRef.current = null;
        clearActiveCall();
      }

      setJoining(true);
      lastJoinParamsRef.current = { type: "dm", directChatId };

      try {
        const { token, livekitUrl, sessionId } = await DmCallAPI.initiate(
          directChatId,
          callType,
        );

        const { Room, RoomEvent, Track } = await import("livekit-client");

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        }) as unknown as LkRoom;

        room.on(RoomEvent.Connected, () => {
          setConnected(true);
          setJoining(false);
          setCallStartedAt(Date.now());
          reconnectAttemptRef.current = 0;
          reconnectAbortRef.current = false;
          syncParticipants(room);
          socket.emit("dmCall:livekitConnected", { sessionId });
        });

        room.on(RoomEvent.Disconnected, () => {
          setConnected(false);
          socket.emit("dmCall:livekitDisconnected", { sessionId });
          if (intentionalLeaveRef.current) {
            clearActiveCall();
            lkRoomRef.current = null;
            lastJoinParamsRef.current = null;
            return;
          }
          lkRoomRef.current = null;
          attemptReconnectRef.current();
        });

        room.on(RoomEvent.Reconnecting, () =>
          setConnectionState("reconnecting"),
        );
        room.on(RoomEvent.Reconnected, () => {
          setConnectionState("connected");
          reconnectAttemptRef.current = 0;
        });

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

        // Auto-enable camera for VIDEO calls.
        if (callType === "VIDEO") {
          const sCam = useCallStore.getState().selectedCamera;
          await room.localParticipant.setCameraEnabled(
            true,
            sCam ? { deviceId: sCam } : undefined,
          );
          setCameraEnabled(true);
        }

        lkRoomRef.current = room;
        // Set both room session ID and DM-specific state.
        setActiveCall(sessionId, "", "");
        setActiveDmCall(sessionId, directChatId, callType, "OUTGOING");
        syncParticipants(room);
      } catch (err) {
        console.error("Failed to initiate DM call", err);
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
      setActiveDmCall,
      setCameraEnabled,
    ],
  );

  /** Join an already-accepted DM call — callee obtains a token and connects to LiveKit. */
  const joinDmCall = useCallback(
    async (directChatId: string) => {
      // Cancel any in-progress reconnect attempt.
      reconnectAbortRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      reconnectAttemptRef.current = 0;
      intentionalLeaveRef.current = false;

      // Single call constraint: disconnect any existing call.
      if (lkRoomRef.current) {
        await lkRoomRef.current.disconnect();
        lkRoomRef.current = null;
        clearActiveCall();
      }

      setJoining(true);
      lastJoinParamsRef.current = { type: "dm", directChatId };

      try {
        const { token, livekitUrl, sessionId } = await DmCallAPI.join(
          directChatId,
        );

        const { Room, RoomEvent, Track } = await import("livekit-client");

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        }) as unknown as LkRoom;

        room.on(RoomEvent.Connected, () => {
          setConnected(true);
          setJoining(false);
          setCallStartedAt(Date.now());
          reconnectAttemptRef.current = 0;
          reconnectAbortRef.current = false;
          syncParticipants(room);
          socket.emit("dmCall:livekitConnected", { sessionId });
        });

        // DuplicateIdentity: another device joined with the same identity.
        // Treat as intentional leave — clear state, don't reconnect.
        room.on(RoomEvent.Disconnected, (reason) => {
          setConnected(false);
          socket.emit("dmCall:livekitDisconnected", { sessionId });
          if (intentionalLeaveRef.current || reason === "DUPLICATE_IDENTITY") {
            clearActiveCall();
            lkRoomRef.current = null;
            lastJoinParamsRef.current = null;
            return;
          }
          lkRoomRef.current = null;
          attemptReconnectRef.current();
        });

        room.on(RoomEvent.Reconnecting, () =>
          setConnectionState("reconnecting"),
        );
        room.on(RoomEvent.Reconnected, () => {
          setConnectionState("connected");
          reconnectAttemptRef.current = 0;
        });

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

        // Determine call type from store (set by incoming call info).
        const callType = useCallStore.getState().dmCallType ?? "VOICE";
        if (callType === "VIDEO") {
          const sCam = useCallStore.getState().selectedCamera;
          await room.localParticipant.setCameraEnabled(
            true,
            sCam ? { deviceId: sCam } : undefined,
          );
          setCameraEnabled(true);
        }

        lkRoomRef.current = room;
        setActiveCall(sessionId, "", "");
        setActiveDmCall(sessionId, directChatId, callType, "ACTIVE");
        syncParticipants(room);
      } catch (err) {
        console.error("Failed to join DM call", err);
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
      setActiveDmCall,
      setCameraEnabled,
    ],
  );

  /** Accept an incoming DM call — signals acceptance then joins LiveKit. */
  const acceptDmCall = useCallback(
    async (directChatId: string) => {
      try {
        // Signal acceptance to the server (marks session as accepted in DB).
        await DmCallAPI.accept(directChatId);
        // Clear the incoming call overlay before connecting.
        setIncomingCallInfo(null);
        // Join the LiveKit room as the callee.
        await joinDmCall(directChatId);
      } catch (err) {
        console.error("Failed to accept DM call", err);
        setIncomingCallInfo(null);
      }
    },
    [joinDmCall, setIncomingCallInfo],
  );

  /**
   * Attempt to rejoin the call after an unexpected disconnect, using
   * exponential backoff. Gives up after MAX_RECONNECT_ATTEMPTS.
   */
  const attemptReconnectFn = useCallback(() => {
    const params = lastJoinParamsRef.current;
    if (!params) return;

    if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      // Exhausted all retries — give up.
      clearActiveCall();
      lastJoinParamsRef.current = null;
      return;
    }

    reconnectAbortRef.current = false;
    const attempt = reconnectAttemptRef.current;
    const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempt), 30_000);

    setConnectionState("reconnecting");

    reconnectTimerRef.current = setTimeout(async () => {
      if (reconnectAbortRef.current) return;
      reconnectAttemptRef.current = attempt + 1;

      try {
        // Get a fresh token — the old one may still be valid, but safer after disconnect.
        let token: string;
        let livekitUrl: string;
        let sessionId: string;

        if (params.type === "channel") {
          const result = await CallAPI.joinToken(params.roomId, params.channelId);
          token = result.token;
          livekitUrl = result.livekitUrl;
          sessionId = result.sessionId;
        } else {
          const result = await DmCallAPI.join(params.directChatId);
          token = result.token;
          livekitUrl = result.livekitUrl;
          sessionId = result.sessionId;
        }

        if (reconnectAbortRef.current) return;

        const { Room, RoomEvent, Track } = await import("livekit-client");
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        }) as unknown as LkRoom;

        room.on(RoomEvent.Connected, () => {
          setConnected(true);
          setConnectionState("connected");
          setCallStartedAt(Date.now());
          reconnectAttemptRef.current = 0;
          syncParticipants(room);
          if (params.type === "dm") {
            socket.emit("dmCall:livekitConnected", { sessionId });
          }
        });

        // DuplicateIdentity: another device joined — treat as intentional leave.
        room.on(RoomEvent.Disconnected, (reason) => {
          setConnected(false);
          lkRoomRef.current = null;
          if (params.type === "dm") {
            socket.emit("dmCall:livekitDisconnected", { sessionId });
          }
          if (intentionalLeaveRef.current || reason === "DUPLICATE_IDENTITY") {
            clearActiveCall();
            lastJoinParamsRef.current = null;
            return;
          }
          // Only retry if not intentionally leaving and not aborted.
          if (!reconnectAbortRef.current) {
            attemptReconnectRef.current();
          }
        });

        room.on(RoomEvent.Reconnecting, () =>
          setConnectionState("reconnecting"),
        );
        room.on(RoomEvent.Reconnected, () => {
          setConnectionState("connected");
          reconnectAttemptRef.current = 0;
        });

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
        if (params.type === "channel") {
          setActiveCall(sessionId, params.channelId, params.roomId);
        } else {
          setActiveDmCall(sessionId, params.directChatId, "VOICE", "ACTIVE");
        }
        syncParticipants(room);
      } catch (err) {
        console.error(`Reconnect attempt ${attempt + 1} failed`, err);
        // Try again with further backoff.
        if (!reconnectAbortRef.current && !intentionalLeaveRef.current) {
          attemptReconnectRef.current();
        } else {
          clearActiveCall();
          lastJoinParamsRef.current = null;
        }
      }
    }, delay);
  }, [
    clearActiveCall,
    setConnected,
    setConnectionState,
    setCallStartedAt,
    setScreenSharing,
    setActiveCall,
    setActiveDmCall,
    syncParticipants,
  ]);

  // Keep the ref pointing to the latest attemptReconnect so callbacks
  // defined earlier (joinCall's disconnect handler) can call it without
  // creating a circular dependency.
  useEffect(() => {
    attemptReconnectRef.current = attemptReconnectFn;
  });

  const leaveCall = useCallback(async () => {
    // Mark as intentional so the disconnect handler doesn't attempt reconnect.
    intentionalLeaveRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAbortRef.current = true;
    reconnectAttemptRef.current = 0;

    const room = lkRoomRef.current;
    if (room) {
      await room.disconnect();
      lkRoomRef.current = null;
    }
    const state = useCallStore.getState();
    // Room call
    if (state.activeRoomId && state.activeChannelId) {
      try {
        await CallAPI.leave(state.activeRoomId, state.activeChannelId);
      } catch {
        // Best-effort
      }
    }
    // DM call
    if (state.activeDirectChatId) {
      try {
        await DmCallAPI.leave(state.activeDirectChatId);
      } catch {
        // Best-effort
      }
    }
    clearActiveCall();
    lastJoinParamsRef.current = null;
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
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
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
        initiateDmCall,
        acceptDmCall,
        joinDmCall,
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
