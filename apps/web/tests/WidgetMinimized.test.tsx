import { describe, it, expect } from "vitest";

// Connection dot class logic extracted from WidgetMinimized.tsx — tested as pure function
// since the component requires deep Shell + CallProvider context.

type ConnectionState =
  "disconnected" | "connecting" | "connected" | "reconnecting";

function getDotClass(connectionState: ConnectionState): string {
  return connectionState === "connected"
    ? "bg-success"
    : connectionState === "reconnecting" || connectionState === "connecting"
      ? "bg-warning animate-pulse"
      : "bg-danger";
}

// CallTimer formatting logic extracted from WidgetMinimized.tsx
function formatElapsed(elapsedMs: number): string {
  const s = Math.floor(elapsedMs / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h > 0 ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

describe("connection dot class", () => {
  it("green dot when connected", () => {
    expect(getDotClass("connected")).toBe("bg-success");
  });

  it("yellow pulsing dot when reconnecting", () => {
    expect(getDotClass("reconnecting")).toBe("bg-warning animate-pulse");
  });

  it("yellow pulsing dot when connecting", () => {
    expect(getDotClass("connecting")).toBe("bg-warning animate-pulse");
  });

  it("red dot when disconnected", () => {
    expect(getDotClass("disconnected")).toBe("bg-danger");
  });
});

describe("CallTimer formatting", () => {
  it("shows 00:00 for zero elapsed", () => {
    expect(formatElapsed(0)).toBe("00:00");
  });

  it("formats seconds only", () => {
    expect(formatElapsed(5000)).toBe("00:05");
  });

  it("formats minutes and seconds", () => {
    expect(formatElapsed(125000)).toBe("02:05");
  });

  it("formats hours, minutes, and seconds", () => {
    expect(formatElapsed(3665000)).toBe("1:01:05");
  });

  it("pads single-digit minutes and seconds", () => {
    expect(formatElapsed(61000)).toBe("01:01");
  });

  it("handles exact hour boundary", () => {
    expect(formatElapsed(3600000)).toBe("1:00:00");
  });

  it("handles exact minute boundary", () => {
    expect(formatElapsed(60000)).toBe("01:00");
  });
});
