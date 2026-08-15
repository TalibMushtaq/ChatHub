import { describe, expect, it } from "vitest";
import {
  presenceTone,
  STATUS_LABELS,
  STATUS_TONES,
} from "../components/app/statusTones";
import type { PresenceInfo } from "../components/app/types";

const presence = (p: Partial<PresenceInfo>): PresenceInfo => ({
  userId: "u1",
  presence: "online",
  status: null,
  customStatus: null,
  ...p,
});

describe("STATUS_TONES", () => {
  it("covers every manual status", () => {
    expect(Object.keys(STATUS_TONES).sort()).toEqual([
      "AVAILABLE",
      "AWAY",
      "BUSY",
      "DND",
      "INVISIBLE",
    ]);
  });

  it("maps each status to its label", () => {
    expect(STATUS_LABELS.DND).toBe("Do not disturb");
    expect(STATUS_LABELS.AVAILABLE).toBe("Available");
    expect(STATUS_LABELS.INVISIBLE).toBe("Invisible");
  });
});

describe("presenceTone", () => {
  it("renders green for online with no manual status", () => {
    expect(presenceTone(presence({ presence: "online" }))).toBe("success");
  });

  it("lets the manual status override the presence color", () => {
    expect(presenceTone(presence({ status: "AVAILABLE" }))).toBe("success");
    // DND must not show the green online dot.
    expect(presenceTone(presence({ status: "DND" }))).toBe("danger");
    expect(presenceTone(presence({ status: "BUSY" }))).toBe("danger");
    expect(presenceTone(presence({ status: "AWAY" }))).toBe("warn");
  });

  it("renders gray for invisible users even when online", () => {
    expect(presenceTone(presence({ status: "INVISIBLE" }))).toBe("muted");
  });

  it("renders amber for idle with no manual status", () => {
    expect(presenceTone(presence({ presence: "idle" }))).toBe("warn");
  });

  it("always renders gray when offline, regardless of manual status", () => {
    expect(presenceTone(presence({ presence: "offline" }))).toBe("muted");
    // The server's disconnect broadcast carries the last real status.
    expect(
      presenceTone(presence({ presence: "offline", status: "AVAILABLE" })),
    ).toBe("muted");
  });
});
