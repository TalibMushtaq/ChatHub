import { describe, expect, it } from "vitest";
import { readStatusOf, type ReadStatus } from "./helpers";
import type { ReadReceipt } from "./types";

const msg = { createdAt: "2026-01-10T12:00:00.000Z" };
const receipt = (userId: string, createdAt: string): ReadReceipt => ({
  userId,
  lastReadMessageId: "m1",
  lastReadMessageCreatedAt: createdAt,
});

describe("readStatusOf", () => {
  it("marks optimistic messages as pending or failed", () => {
    expect(readStatusOf({ ...msg, pending: true }, "me", [], false)).toBe(
      "pending",
    );
    expect(readStatusOf({ ...msg, failed: true }, "me", [], false)).toBe(
      "failed",
    );
  });

  it("reports sent when no one else has a cursor", () => {
    expect(readStatusOf(msg, "me", [], false)).toBe("sent");
    expect(readStatusOf(msg, "me", [receipt("me", msg.createdAt)], false)).toBe(
      "sent",
    );
  });

  it("reports sent when the other cursor has not reached the message", () => {
    const others = [receipt("bob", "2026-01-10T11:00:00.000Z")];
    expect(readStatusOf(msg, "me", others, false)).toBe("sent");
  });

  it("reports read for a DM once the other participant passes the message", () => {
    const others = [receipt("bob", "2026-01-10T12:00:00.000Z")];
    expect(readStatusOf(msg, "me", others, false)).toBe("read");
  });

  it("reports readAll for a room only when every other member has read it", () => {
    const others = [
      receipt("bob", "2026-01-10T12:00:00.000Z"),
      receipt("carol", "2026-01-10T12:00:00.000Z"),
    ];
    expect(readStatusOf(msg, "me", others, true)).toBe("readAll");
  });

  it("reports readSome for a room when only part of the members have read it", () => {
    const others = [
      receipt("bob", "2026-01-10T12:00:00.000Z"),
      receipt("carol", "2026-01-10T11:00:00.000Z"),
    ];
    expect(readStatusOf(msg, "me", others, true)).toBe("readSome");
  });

  it("ignores the sender's own cursor when deciding read state", () => {
    const others = [receipt("me", "2026-01-10T12:00:00.000Z")];
    expect(readStatusOf(msg, "me", others, true)).toBe("sent");
  });

  it("returns a stable union of states for type consumers", () => {
    const statuses: ReadStatus[] = [
      "pending",
      "failed",
      "sent",
      "read",
      "readSome",
      "readAll",
    ];
    expect(statuses).toContain(readStatusOf(msg, "me", [], false));
  });
});
