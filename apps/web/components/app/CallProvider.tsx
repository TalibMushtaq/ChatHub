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
  // Discriminated union supports both room calls and DM calls; DM calls also
  // carry their call type so a reconnect restores video state if needed.
  const lastJoinParamsRef = useRef<
    | { type: "channel"; roomId: string; channelId: string }
    | { type: "dm"; directChatId: string; callType: DmCallType }
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
    setDeafened,
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

  /**
   * Wire the LiveKit room event handlers shared by every join path (channel,
   * DM initiate, DM join, and reconnect). Kept in one place so the four call
   * flows can't drift. Connected/Disconnected behavior is identical aside from
   * DM socket signalling and the post-disconnect callback.
   */
  const registerRoomListeners = useCallback(
    (
      room: LkRoom,
      opts: {
        sessionId: string;
        isDmCall: boolean;
        onDisconnected?: () => void;
      },
      // Structural subset of LiveKit's RoomEvent/Track constants — only the
      // string event names this helper registers. Typed explicitly (rather than
      // `Record<string, string>`) because noUncheckedIndexedAccess widens
      // indexed reads to `string | undefined`.
      RoomEvent: {
        Connected: string;
        Disconnected: string;
        Reconnecting: string;
        Reconnected: string;
        ParticipantConnected: string;
        ParticipantDisconnected: string;
        TrackSubscribed: string;
        TrackUnsubscribed: string;
        LocalTrackUnpublished: string;
        ActiveSpeakersChanged: string;
      },
      Track: {
        Source: { ScreenShare: string; Camera: string; Microphone: string };
      },
    ) => {
      room.on(RoomEvent.Connected, () => {
        setConnected(true);
        setConnectionState("connected");
        setJoining(false);
        setCallStartedAt(Date.now());
        reconnectAttemptRef.current = 0;
        reconnectAbortRef.current = false;
        syncParticipants(room);
        if (opts.isDmCall) {
          socket.emit("dmCall:livekitConnected", { sessionId: opts.sessionId });
        }
      });

      // DuplicateIdentity: another device joined with the same identity —
      // treat as intentional leave so this tab stops and never reconnects.
      room.on(RoomEvent.Disconnected, (reason) => {
        setConnected(false);
        if (opts.isDmCall) {
          socket.emit("dmCall:livekitDisconnected", {
            sessionId: opts.sessionId,
          });
        }
        lkRoomRef.current = null;
        if (intentionalLeaveRef.current || reason === "DUPLICATE_IDENTITY") {
          clearActiveCall();
          lastJoinParamsRef.current = null;
          return;
        }
        opts.onDisconnected?.();
      });

      room.on(RoomEvent.Reconnecting, () => setConnectionState("reconnecting"));
      room.on(RoomEvent.Reconnected, () => {
        setConnectionState("connected");
        reconnectAttemptRef.current = 0;
      });

      room.on(RoomEvent.ParticipantConnected, () => syncParticipants(room));
      room.on(RoomEvent.ParticipantDisconnected, () => syncParticipants(room));
      room.on(RoomEvent.TrackSubscribed, () => syncParticipants(room));
      room.on(RoomEvent.TrackUnsubscribed, () => syncParticipants(room));

      room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
        if (pub.source === Track.Source.ScreenShare) setScreenSharing(false);
        syncParticipants(room);
      });

      // ActiveSpeakersChanged is the highest-frequency event (it fires whenever
      // anyone starts/stops talking); throttle participant syncs + ring updates.
      const lastSpeakRef = { t: 0 };
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const now = Date.now();
        if (now - lastSpeakRef.t < 150) return;
        lastSpeakRef.t = now;
        syncParticipants(room);
        setSpeakerIdentity(speakers[0]?.identity ?? null);
      });
    },
    [
      syncParticipants,
      setConnected,
      setConnectionState,
      setJoining,
      setCallStartedAt,
      setScreenSharing,
      setSpeakerIdentity,
      clearActiveCall,
    ],
  );

  /** Enable the local microphone (and camera for video calls) using the user's
   *  saved device preferences. Shared by every join path so device selection
   *  stays consistent across initial joins and reconnects. */
  const enableLocalMedia = useCallback(
    async (room: LkRoom, video: boolean) => {
      const sMic = useCallStore.getState().selectedMicrophone;
      const constraints = buildMediaConstraints({
        audio: true,
        microphoneId: sMic,
      });
      await room.localParticipant.setMicrophoneEnabled(
        true,
        typeof constraints.audio === "object" ? constraints.audio : undefined,
      );
      if (video) {
        const sCam = useCallStore.getState().selectedCamera;
        try {
          await room.localParticipant.setCameraEnabled(
            true,
            sCam ? { deviceId: { ideal: sCam } } : undefined,
          );
          setCameraEnabled(true);
        } catch (err) {
          // Camera unavailable or permission denied — join audio-only rather
          // than failing the whole call (same fallback as the pre-join preview).
          console.warn("Camera unavailable — joining call without video", err);
        }
      }
    },
    [setCameraEnabled],
  );

  /**
   * Shared join path for channel, DM-initiate, and DM-accept flows. These
   * three callers previously copy-pasted ~90 identical lines (reconnect
   * cancellation, the single-call constraint, LiveKit connect, post-connect
   * state mutations) that could drift apart. Each caller supplies only what
   * differs: credentials fetch, join params, the video flag, and the active
   * call bookkeeping.
   */
  const joinLiveKitRoom = useCallback(
    async (opts: {
      kind: "channel" | "dm";
      getCredentials: () => Promise<{
        token: string;
        livekitUrl: string;
        sessionId: string;
      }>;
      setActive: (sessionId: string) => void;
      video: boolean;
      recordJoinParams: () => void;
    }) => {
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
      opts.recordJoinParams();

      let room: LkRoom | null = null;
      try {
        const { token, livekitUrl, sessionId } = await opts.getCredentials();

        // Dynamic import: livekit-client is only loaded when a call is joined.
        const { Room, RoomEvent, Track } = await import("livekit-client");

        room = new Room({
          adaptiveStream: true,
          dynacast: true,
        }) as unknown as LkRoom;

        registerRoomListeners(
          room,
          {
            sessionId,
            isDmCall: opts.kind === "dm",
            onDisconnected: () => attemptReconnectRef.current(),
          },
          RoomEvent,
          Track,
        );

        await room.connect(livekitUrl, token);

        await enableLocalMedia(room, opts.video);

        lkRoomRef.current = room;
        opts.setActive(sessionId);
        syncParticipants(room);
      } catch (err) {
        console.error(`Failed to join ${opts.kind} call`, err);
        setJoining(false);
        if (room && room !== lkRoomRef.current) {
          // Tear down the partially-connected room. Mark the disconnect as
          // intentional so the Disconnected handler doesn't start reconnect
          // churn for a join that already failed, then surface the error so
          // the caller (toast / error UI) actually shows the user something.
          intentionalLeaveRef.current = true;
          await room.disconnect();
        }
        throw err;
      }
    },
    [
      clearActiveCall,
      setJoining,
      syncParticipants,
      enableLocalMedia,
      registerRoomListeners,
    ],
  );

  const joinCall = useCallback(
    async (roomId: string, channelId: string) => {
      await joinLiveKitRoom({
        kind: "channel",
        video: false,
        recordJoinParams: () => {
          lastJoinParamsRef.current = { type: "channel", roomId, channelId };
        },
        getCredentials: () => CallAPI.joinToken(roomId, channelId),
        setActive: (sessionId) => setActiveCall(sessionId, channelId, roomId),
      });
    },
    [joinLiveKitRoom, setActiveCall],
  );

  /** Initiate a DM call — creates a session, caller gets token and connects to LiveKit. */
  const initiateDmCall = useCallback(
    async (directChatId: string, callType: DmCallType) => {
      await joinLiveKitRoom({
        kind: "dm",
        video: callType === "VIDEO",
        recordJoinParams: () => {
          lastJoinParamsRef.current = { type: "dm", directChatId, callType };
        },
        getCredentials: () => DmCallAPI.initiate(directChatId, callType),
        setActive: (sessionId) => {
          // Set both room session ID and DM-specific state.
          setActiveCall(sessionId, "", "");
          setActiveDmCall(sessionId, directChatId, callType, "OUTGOING");
        },
      });
    },
    [joinLiveKitRoom, setActiveCall, setActiveDmCall],
  );

  /** Join an already-accepted DM call — callee obtains a token and connects to LiveKit. */
  const joinDmCall = useCallback(
    async (directChatId: string) => {
      // Determine call type from store (set by incoming call info) before we
      // record join params, so a reconnect can restore the right call type.
      const callType = useCallStore.getState().dmCallType ?? "VOICE";
      await joinLiveKitRoom({
        kind: "dm",
        video: callType === "VIDEO",
        recordJoinParams: () => {
          lastJoinParamsRef.current = { type: "dm", directChatId, callType };
        },
        getCredentials: () => DmCallAPI.join(directChatId),
        setActive: (sessionId) => {
          setActiveCall(sessionId, "", "");
          setActiveDmCall(sessionId, directChatId, callType, "ACTIVE");
        },
      });
    },
    [joinLiveKitRoom, setActiveCall, setActiveDmCall],
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
          const result = await CallAPI.joinToken(
            params.roomId,
            params.channelId,
          );
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

        registerRoomListeners(
          room,
          {
            sessionId,
            isDmCall: params.type === "dm",
            onDisconnected: () => {
              // Only retry if not intentionally leaving and not aborted.
              if (!reconnectAbortRef.current) {
                attemptReconnectRef.current();
              }
            },
          },
          RoomEvent,
          Track,
        );

        await room.connect(livekitUrl, token);

        await enableLocalMedia(
          room,
          params.type === "dm" && params.callType === "VIDEO",
        );

        lkRoomRef.current = room;
        if (params.type === "channel") {
          setActiveCall(sessionId, params.channelId, params.roomId);
        } else {
          // Preserve the original call type so video DM calls restore video.
          setActiveDmCall(
            sessionId,
            params.directChatId,
            params.callType,
            "ACTIVE",
          );
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
    setConnectionState,
    setActiveCall,
    setActiveDmCall,
    syncParticipants,
    enableLocalMedia,
    registerRoomListeners,
  ]);

  // Keep the ref pointing to the latest attemptReconnect so callbacks
  // defined earlier (joinCall's disconnect handler) can call it without
  // creating a circular dependency.
  useEffect(() => {
    attemptReconnectRef.current = attemptReconnectFn;
  });

  /**
   * Remote-hangup teardown. AppShell bumps `endCallRequest` when the server
   * signals the call is over (dmCall:ended / call.ended / kicked / declined /
   * error) and when the caller cancels. Those paths used to only clear the UI
   * store, leaving the LiveKit room open — the server then deletes the room,
   * force-closing our data channels ("publisher data channel closed
   * unexpectedly" console errors) and triggering needless reconnect attempts.
   * This tears the room down first, so the close is graceful and flagged as
   * intentional (no reconnect).
   */
  useEffect(() => {
    return useCallStore.subscribe((state, prev) => {
      if (state.endCallRequest === prev.endCallRequest) return;
      intentionalLeaveRef.current = true;
      reconnectAbortRef.current = true;
      reconnectAttemptRef.current = 0;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const room = lkRoomRef.current;
      if (room) {
        lkRoomRef.current = null;
        void room.disconnect();
      }
      lastJoinParamsRef.current = null;
      useCallStore.getState().clearActiveCall();
    });
  }, []);

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
    setDeafened(newDeafened);
    syncParticipants(room);
  }, [setMuted, setDeafened, syncParticipants]);

  const toggleCamera = useCallback(async () => {
    const room = lkRoomRef.current;
    if (!room?.localParticipant) return;
    const currentCam = useCallStore.getState().isCameraEnabled;
    const sCam = useCallStore.getState().selectedCamera;
    const newEnabled = !currentCam;
    try {
      await room.localParticipant.setCameraEnabled(
        newEnabled,
        // ideal (not exact) so a stale saved deviceId never throws
        // OverconstrainedError — same rationale as buildMediaConstraints.
        sCam ? { deviceId: { ideal: sCam } } : undefined,
      );
      setCameraEnabled(newEnabled);
    } catch (err) {
      // Failed to start/stop the camera — keep the previous UI state so the
      // button doesn't report an enabled camera that never started.
      console.warn("Failed to toggle camera", err);
    }
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
