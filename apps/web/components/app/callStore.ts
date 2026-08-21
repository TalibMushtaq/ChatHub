import { create } from "zustand";

// Call-specific UI state — isolated from ShellCtx (Phase 7 §11).
// LiveKit owns RTC state; this store owns UI/application state only.

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

  // Participants (application-level; LiveKit is authoritative for media state)
  participants: CallParticipant[];

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
}

const DEVICE_STORAGE_KEY = "chathubby:call-devices";

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

  participants: [],

  setActiveCall: (sessionId, channelId, roomId) =>
    set({
      activeSessionId: sessionId,
      activeChannelId: channelId,
      activeRoomId: roomId,
    }),
  clearActiveCall: () =>
    set({
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
}));
