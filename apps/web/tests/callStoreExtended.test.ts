// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { useCallStore } from "../components/app/callStore";

// Ensure localStorage is available (some jsdom versions don't provide it)
const store = new Map<string, string>();
const mockLocalStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
  get length() {
    return store.size;
  },
  key: (i: number) => [...store.keys()][i] ?? null,
};
Object.defineProperty(globalThis, "localStorage", {
  value: mockLocalStorage,
  writable: true,
});

beforeEach(() => {
  localStorage.clear();
  useCallStore.setState(
    useCallStore.getInitialState?.() ?? {
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
      selectedMicrophone: null,
      selectedCamera: null,
      selectedSpeaker: null,
      isDeviceSettingsOpen: false,
      isWidgetExpanded: false,
      widgetPosition: null,
      callStartedAt: null,
      participants: [],
      participantsByChannel: {},
    },
  );
});

describe("device prefs persistence (localStorage)", () => {
  it("setSelectedMicrophone persists to localStorage", () => {
    useCallStore.getState().setSelectedMicrophone("mic-1");
    expect(useCallStore.getState().selectedMicrophone).toBe("mic-1");
    const stored = JSON.parse(
      localStorage.getItem("chathubby:call-devices") ?? "{}",
    );
    expect(stored.selectedMicrophone).toBe("mic-1");
  });

  it("setSelectedCamera persists to localStorage", () => {
    useCallStore.getState().setSelectedCamera("cam-2");
    expect(useCallStore.getState().selectedCamera).toBe("cam-2");
    const stored = JSON.parse(
      localStorage.getItem("chathubby:call-devices") ?? "{}",
    );
    expect(stored.selectedCamera).toBe("cam-2");
  });

  it("setSelectedSpeaker persists to localStorage", () => {
    useCallStore.getState().setSelectedSpeaker("spk-3");
    expect(useCallStore.getState().selectedSpeaker).toBe("spk-3");
    const stored = JSON.parse(
      localStorage.getItem("chathubby:call-devices") ?? "{}",
    );
    expect(stored.selectedSpeaker).toBe("spk-3");
  });

  it("device setters preserve existing sibling values", () => {
    useCallStore.getState().setSelectedMicrophone("mic-1");
    useCallStore.getState().setSelectedCamera("cam-2");
    useCallStore.getState().setSelectedSpeaker("spk-3");

    useCallStore.getState().setSelectedMicrophone("mic-new");
    const stored = JSON.parse(
      localStorage.getItem("chathubby:call-devices") ?? "{}",
    );
    expect(stored).toEqual({
      selectedMicrophone: "mic-new",
      selectedCamera: "cam-2",
      selectedSpeaker: "spk-3",
    });
  });
});

describe("widget position persistence (localStorage)", () => {
  it("setWidgetPosition stores position to localStorage", () => {
    useCallStore.getState().setWidgetPosition({ x: 100, y: 200 });
    expect(useCallStore.getState().widgetPosition).toEqual({ x: 100, y: 200 });
    const stored = JSON.parse(
      localStorage.getItem("chathubby:widget-pos") ?? "null",
    );
    expect(stored).toEqual({ x: 100, y: 200 });
  });

  it("setWidgetPosition(null) removes from localStorage", () => {
    useCallStore.getState().setWidgetPosition({ x: 100, y: 200 });
    useCallStore.getState().setWidgetPosition(null);
    expect(useCallStore.getState().widgetPosition).toBeNull();
    expect(localStorage.getItem("chathubby:widget-pos")).toBeNull();
  });
});

describe("clearActiveCall preserves participantsByChannel", () => {
  it("removes only the active channel's entry", () => {
    useCallStore.setState({
      activeChannelId: "ch-a",
      participantsByChannel: {
        "ch-a": [
          { userId: "1", username: "u1", displayName: null, avatar: null },
        ],
        "ch-b": [
          { userId: "2", username: "u2", displayName: null, avatar: null },
        ],
      },
    });

    useCallStore.getState().clearActiveCall();

    const { participantsByChannel, activeChannelId } = useCallStore.getState();
    expect(activeChannelId).toBeNull();
    expect(participantsByChannel["ch-a"]).toBeUndefined();
    expect(participantsByChannel["ch-b"]).toHaveLength(1);
  });

  it("resets all call state fields", () => {
    useCallStore.setState({
      activeSessionId: "s1",
      activeChannelId: "ch-1",
      activeRoomId: "r1",
      isJoining: true,
      isConnected: true,
      connectionState: "connected",
      isMuted: true,
      isDeafened: true,
      isCameraEnabled: true,
      isScreenSharing: true,
      participants: [
        { userId: "u1", username: "u1", displayName: null, avatar: null },
      ],
      callStartedAt: Date.now(),
    });

    useCallStore.getState().clearActiveCall();

    const s = useCallStore.getState();
    expect(s.activeSessionId).toBeNull();
    expect(s.activeChannelId).toBeNull();
    expect(s.activeRoomId).toBeNull();
    expect(s.isJoining).toBe(false);
    expect(s.isConnected).toBe(false);
    expect(s.connectionState).toBe("disconnected");
    expect(s.isMuted).toBe(false);
    expect(s.isDeafened).toBe(false);
    expect(s.isCameraEnabled).toBe(false);
    expect(s.isScreenSharing).toBe(false);
    expect(s.participants).toEqual([]);
    expect(s.callStartedAt).toBeNull();
  });
});

describe("device selections persist across setters", () => {
  it("setSelectedMicrophone preserves camera and speaker", () => {
    useCallStore.getState().setSelectedCamera("cam-1");
    useCallStore.getState().setSelectedSpeaker("spk-1");
    useCallStore.getState().setSelectedMicrophone("mic-2");

    const s = useCallStore.getState();
    expect(s.selectedMicrophone).toBe("mic-2");
    expect(s.selectedCamera).toBe("cam-1");
    expect(s.selectedSpeaker).toBe("spk-1");
  });

  it("setSelectedCamera preserves microphone and speaker", () => {
    useCallStore.getState().setSelectedMicrophone("mic-1");
    useCallStore.getState().setSelectedSpeaker("spk-1");
    useCallStore.getState().setSelectedCamera("cam-2");

    const s = useCallStore.getState();
    expect(s.selectedMicrophone).toBe("mic-1");
    expect(s.selectedCamera).toBe("cam-2");
    expect(s.selectedSpeaker).toBe("spk-1");
  });

  it("setSelectedSpeaker preserves microphone and camera", () => {
    useCallStore.getState().setSelectedMicrophone("mic-1");
    useCallStore.getState().setSelectedCamera("cam-1");
    useCallStore.getState().setSelectedSpeaker("spk-2");

    const s = useCallStore.getState();
    expect(s.selectedMicrophone).toBe("mic-1");
    expect(s.selectedCamera).toBe("cam-1");
    expect(s.selectedSpeaker).toBe("spk-2");
  });
});
