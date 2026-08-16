import { describe, it, expect } from "vitest";
import { buildFriendRequestPushPayload } from "../../../../src/services/push/payload";

describe("buildFriendRequestPushPayload", () => {
  it("builds a message-shaped payload with the sender as title", () => {
    const payload = buildFriendRequestPushPayload({
      event: "new",
      requestId: "fr1",
      fromId: "u1",
      fromName: "Alice",
    });

    expect(payload.title).toBe("Alice");
    expect(payload.body).toBe("sent you a friend request");
    expect(payload.tag).toBe("chathubby:friend-request:fr1");
    expect(payload.data).toEqual({
      kind: "friend-request",
      event: "new",
      requestId: "fr1",
      fromId: "u1",
      fromName: "Alice",
    });
  });

  it("uses event-specific copy for every event", () => {
    const cases: Array<
      [Parameters<typeof buildFriendRequestPushPayload>[0]["event"], string]
    > = [
      ["new", "sent you a friend request"],
      ["accepted", "accepted your friend request"],
      ["declined", "declined your friend request"],
      ["blocked", "blocked you"],
    ];

    for (const [event, body] of cases) {
      const payload = buildFriendRequestPushPayload({
        event,
        requestId: "fr1",
        fromId: "u1",
        fromName: "Alice",
      });
      expect(payload.body).toBe(body);
      expect(payload.data.event).toBe(event);
      expect(payload.tag).toBe("chathubby:friend-request:fr1");
    }
  });

  it("keeps the tag stable per request across events for stacking", () => {
    const a = buildFriendRequestPushPayload({
      event: "new",
      requestId: "fr1",
      fromId: "u1",
      fromName: "Alice",
    });
    const b = buildFriendRequestPushPayload({
      event: "accepted",
      requestId: "fr1",
      fromId: "u1",
      fromName: "Alice",
    });
    expect(a.tag).toBe(b.tag);
  });
});
