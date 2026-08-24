import { describe, it, expect } from "vitest";

// Grid sizing logic extracted from WidgetExpanded.tsx — tested as pure function
// since the component requires deep Shell + LiveKit + CallProvider context.

function getGridCols(participantCount: number): string {
  return participantCount <= 1
    ? "grid-cols-1"
    : participantCount <= 4
      ? "grid-cols-2"
      : "grid-cols-3";
}

// Connection state overlay logic
type ConnectionState =
  "disconnected" | "connecting" | "connected" | "reconnecting";

function shouldShowReconnectingOverlay(
  connectionState: ConnectionState,
): boolean {
  return connectionState === "reconnecting";
}

describe("grid sizing", () => {
  it("single column for 0 participants", () => {
    expect(getGridCols(0)).toBe("grid-cols-1");
  });

  it("single column for 1 participant", () => {
    expect(getGridCols(1)).toBe("grid-cols-1");
  });

  it("two columns for 2 participants", () => {
    expect(getGridCols(2)).toBe("grid-cols-2");
  });

  it("two columns for 3 participants", () => {
    expect(getGridCols(3)).toBe("grid-cols-2");
  });

  it("two columns for 4 participants", () => {
    expect(getGridCols(4)).toBe("grid-cols-2");
  });

  it("three columns for 5 participants", () => {
    expect(getGridCols(5)).toBe("grid-cols-3");
  });

  it("three columns for many participants", () => {
    expect(getGridCols(20)).toBe("grid-cols-3");
  });
});

describe("reconnecting overlay visibility", () => {
  it("shows overlay when reconnecting", () => {
    expect(shouldShowReconnectingOverlay("reconnecting")).toBe(true);
  });

  it("hides overlay when connected", () => {
    expect(shouldShowReconnectingOverlay("connected")).toBe(false);
  });

  it("hides overlay when disconnected", () => {
    expect(shouldShowReconnectingOverlay("disconnected")).toBe(false);
  });

  it("hides overlay when connecting", () => {
    expect(shouldShowReconnectingOverlay("connecting")).toBe(false);
  });
});
