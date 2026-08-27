import { describe, expect, it } from "vitest";
import { callHistoryTint } from "../components/app/messages/CallHistoryMessage";

describe("callHistoryTint", () => {
  it("uses the red missed-call tint", () => {
    expect(callHistoryTint("MISSED")).toBe("bg-danger-soft text-danger");
  });

  it("uses the amber declined-call tint", () => {
    expect(callHistoryTint("DECLINED")).toBe("bg-warning/15 text-warning");
  });

  it("uses the muted cancelled-call tint", () => {
    expect(callHistoryTint("CANCELLED")).toBe("bg-surface-2 text-muted");
  });

  it("uses the green completed-call tint", () => {
    expect(callHistoryTint("COMPLETED")).toBe("bg-success-wash text-success");
  });

  it("falls back to the completed tint when the outcome is unknown", () => {
    expect(callHistoryTint(undefined)).toBe("bg-success-wash text-success");
  });
});
