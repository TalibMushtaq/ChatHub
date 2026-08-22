import { describe, it, expect, beforeEach } from "vitest";
import { useCallStore } from "../components/app/callStore";

beforeEach(() => {
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
    },
  );
});

describe("widget state", () => {
  it("isWidgetExpanded defaults to false", () => {
    expect(useCallStore.getState().isWidgetExpanded).toBe(false);
  });

  it("setWidgetExpanded toggles", () => {
    useCallStore.getState().setWidgetExpanded(true);
    expect(useCallStore.getState().isWidgetExpanded).toBe(true);
  });

  it("callStartedAt is reset by clearActiveCall", () => {
    useCallStore.getState().setCallStartedAt(Date.now());
    useCallStore.getState().clearActiveCall();
    expect(useCallStore.getState().callStartedAt).toBeNull();
  });
});
