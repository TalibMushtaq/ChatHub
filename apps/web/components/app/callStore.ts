import { create } from "zustand";
import type { DmCallType } from "./api";

// Call-specific UI state — isolated from ShellCtx (Phase 7 §11).
// LiveKit owns RTC state; this store owns UI/application state only.

// ---------------------------------------------------------------------------
// DM call types (Phase 11)
// ---------------------------------------------------------------------------

export type DmCallUiStatus =
  "IDLE" | "OUTGOING" | "INCOMING" | "ACTIVE" | "ENDED";

export interface IncomingCallInfo {
  sessionId: string;
  directChatId: string;
  callType: DmCallType;
  caller: {
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
  };
}

export interface CallParticipant {
  userId: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  isMuted?: boolean;
  isSpeaking?: boolean;
}

export interface CallState {
  // Active call identifiers
  activeSessionId: string | null;
  activeChannelId: string | null;
  activeRoomId: string | null;

  // Connection lifecycle
  isJoining: boolean;
  isConnected: boolean;
  isPreviewOpen: boolean;
  connectionState: "disconnected" | "connecting" | "connected" | "reconnecting";

  // Local media state
  isMuted: boolean;
  isDeafened: boolean;
  isCameraEnabled: boolean;
  isScreenSharing: boolean;

  // Device selections (persisted to localStorage)
  selectedMicrophone: string | null;
  selectedCamera: string | null;
  selectedSpeaker: string | null;

  // UI toggles
  isDeviceSettingsOpen: boolean;

  // Widget UI state (Phase 8)
  isWidgetExpanded: boolean;
  widgetPosition: { x: number; y: number } | null;
  callStartedAt: number | null;

  // Participants (application-level; LiveKit is authoritative for media state)
  participants: CallParticipant[];

  // Per-channel participant lists for sidebar presence (all channels, not just active).
  participantsByChannel: Record<string, CallParticipant[]>;

  // DM call state (Phase 11)
  activeDirectChatId: string | null;
  dmCallSessionId: string | null;
  dmCallStatus: DmCallUiStatus;
  dmCallType: DmCallType | null;
  dmCallStartedAt: number | null;
  dmCallConnectedAt: number | null;
  incomingCallInfo: IncomingCallInfo | null;

  // Actions
  setActiveCall: (
    sessionId: string | null,
    channelId: string,
    roomId: string,
  ) => void;
  clearActiveCall: () => void;
  setJoining: (v: boolean) => void;
  setConnected: (v: boolean) => void;
  setConnectionState: (
    s: "disconnected" | "connecting" | "connected" | "reconnecting",
  ) => void;
  setPreviewOpen: (v: boolean) => void;
  setMuted: (v: boolean) => void;
  setDeafened: (v: boolean) => void;
  setCameraEnabled: (v: boolean) => void;
  setScreenSharing: (v: boolean) => void;
  setSelectedMicrophone: (id: string | null) => void;
  setSelectedCamera: (id: string | null) => void;
  setSelectedSpeaker: (id: string | null) => void;
  setDeviceSettingsOpen: (v: boolean) => void;
  setParticipants: (p: CallParticipant[]) => void;
  setParticipantsForChannel: (
    channelId: string,
    p: CallParticipant[] | ((prev: CallParticipant[]) => CallParticipant[]),
  ) => void;
  setWidgetExpanded: (v: boolean) => void;
  setWidgetPosition: (pos: { x: number; y: number } | null) => void;
  setCallStartedAt: (t: number | null) => void;

  // DM call actions (Phase 11)
  setActiveDmCall: (
    sessionId: string,
    directChatId: string,
    callType: DmCallType,
    status: DmCallUiStatus,
  ) => void;
  setDmCallStatus: (status: DmCallUiStatus) => void;
  setDmCallConnectedAt: (t: number | null) => void;
  setIncomingCallInfo: (info: IncomingCallInfo | null) => void;
  clearDmCall: () => void;
  // Remote-hangup signal: AppShell socket handlers bump this counter when the
  // server ends the call (ended/cancelled/declined/kicked). CallProvider
  // subscribes to it and tears down its LiveKit room; a bare clearActiveCall()
  // leaves the room open until the server force-closes it.
  endCallRequest: number;
  requestEndCall: () => void;
}

const DEVICE_STORAGE_KEY = "chathubby:call-devices";
const WIDGET_POS_KEY = "chathubby:widget-pos";

function loadDevicePrefs(): {
  selectedMicrophone?: string | null;
  selectedCamera?: string | null;
  selectedSpeaker?: string | null;
} {
  try {
    const raw = localStorage.getItem(DEVICE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDevicePrefs(
  mic: string | null,
  cam: string | null,
  speaker: string | null,
): void {
  try {
    localStorage.setItem(
      DEVICE_STORAGE_KEY,
      JSON.stringify({
        selectedMicrophone: mic,
        selectedCamera: cam,
        selectedSpeaker: speaker,
      }),
    );
  } catch {
    // localStorage full or blocked — non-fatal.
  }
}

const devicePrefs = loadDevicePrefs();
const initialWidgetPos = (function loadWidgetPos(): {
  x: number;
  y: number;
} | null {
  try {
    const raw = localStorage.getItem(WIDGET_POS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();

function saveWidgetPos(pos: { x: number; y: number } | null): void {
  try {
    if (pos) {
      localStorage.setItem(WIDGET_POS_KEY, JSON.stringify(pos));
    } else {
      localStorage.removeItem(WIDGET_POS_KEY);
    }
  } catch {
    // non-fatal
  }
}

export const useCallStore = create<CallState>((set, get) => ({
  activeSessionId: null,
  activeChannelId: null,
  activeRoomId: null,

  isJoining: false,
  isConnected: false,
  isPreviewOpen: false,
  connectionState: "disconnected",

  isMuted: false,
  isDeafened: false,
  isCameraEnabled: false,
  isScreenSharing: false,

  selectedMicrophone: devicePrefs.selectedMicrophone ?? null,
  selectedCamera: devicePrefs.selectedCamera ?? null,
  selectedSpeaker: devicePrefs.selectedSpeaker ?? null,

  isDeviceSettingsOpen: false,
  isWidgetExpanded: false,
  widgetPosition: initialWidgetPos,
  callStartedAt: null,

  participants: [],
  participantsByChannel: {},

  // DM call state (Phase 11)
  activeDirectChatId: null,
  dmCallSessionId: null,
  dmCallStatus: "IDLE",
  dmCallType: null,
  dmCallStartedAt: null,
  dmCallConnectedAt: null,
  incomingCallInfo: null,
  endCallRequest: 0,

  setActiveCall: (sessionId, channelId, roomId) =>
    set({
      activeSessionId: sessionId,
      activeChannelId: channelId,
      activeRoomId: roomId,
    }),
  clearActiveCall: () =>
    set((state) => {
      const id = state.activeChannelId;
      const entries = Object.entries(state.participantsByChannel).filter(
        ([k]) => k !== id,
      );
      return {
        activeSessionId: null,
        activeChannelId: null,
        activeRoomId: null,
        isJoining: false,
        isConnected: false,
        connectionState: "disconnected",
        isMuted: false,
        isDeafened: false,
        isCameraEnabled: false,
        isScreenSharing: false,
        participants: [],
        participantsByChannel: Object.fromEntries(entries),
        callStartedAt: null,
        // DM fields also cleared (Phase 11)
        activeDirectChatId: null,
        dmCallSessionId: null,
        dmCallStatus: "IDLE",
        dmCallType: null,
        dmCallStartedAt: null,
        dmCallConnectedAt: null,
        incomingCallInfo: null,
      };
    }),
  setJoining: (v) => set({ isJoining: v }),
  setConnected: (v) => set({ isConnected: v }),
  setConnectionState: (s) => set({ connectionState: s }),
  setPreviewOpen: (v) => set({ isPreviewOpen: v }),
  setMuted: (v) => set({ isMuted: v }),
  setDeafened: (v) => set({ isDeafened: v }),
  setCameraEnabled: (v) => set({ isCameraEnabled: v }),
  setScreenSharing: (v) => set({ isScreenSharing: v }),
  setSelectedMicrophone: (id) => {
    set({ selectedMicrophone: id });
    const s = get();
    saveDevicePrefs(id, s.selectedCamera, s.selectedSpeaker);
  },
  setSelectedCamera: (id) => {
    set({ selectedCamera: id });
    const s = get();
    saveDevicePrefs(s.selectedMicrophone, id, s.selectedSpeaker);
  },
  setSelectedSpeaker: (id) => {
    set({ selectedSpeaker: id });
    const s = get();
    saveDevicePrefs(s.selectedMicrophone, s.selectedCamera, id);
  },
  setDeviceSettingsOpen: (v) => set({ isDeviceSettingsOpen: v }),
  setParticipants: (p) => set({ participants: p }),
  setParticipantsForChannel: (channelId, p) =>
    set((state) => ({
      participantsByChannel: {
        ...state.participantsByChannel,
        [channelId]:
          typeof p === "function"
            ? p(state.participantsByChannel[channelId] ?? [])
            : p,
      },
    })),
  setWidgetExpanded: (v) => set({ isWidgetExpanded: v }),
  setWidgetPosition: (pos) => {
    set({ widgetPosition: pos });
    saveWidgetPos(pos);
  },
  setCallStartedAt: (t) => set({ callStartedAt: t }),

  // DM call actions (Phase 11)
  setActiveDmCall: (sessionId, directChatId, callType, status) =>
    set({
      activeDirectChatId: directChatId,
      dmCallSessionId: sessionId,
      dmCallType: callType,
      dmCallStatus: status,
      dmCallStartedAt: Date.now(),
      dmCallConnectedAt: null,
    }),
  setDmCallStatus: (status) => set({ dmCallStatus: status }),
  setDmCallConnectedAt: (t) => set({ dmCallConnectedAt: t }),
  setIncomingCallInfo: (info) => set({ incomingCallInfo: info }),
  clearDmCall: () =>
    set({
      activeDirectChatId: null,
      dmCallSessionId: null,
      dmCallStatus: "IDLE",
      dmCallType: null,
      dmCallStartedAt: null,
      dmCallConnectedAt: null,
      incomingCallInfo: null,
    }),
  requestEndCall: () =>
    set((state) => ({ endCallRequest: state.endCallRequest + 1 })),
}));
