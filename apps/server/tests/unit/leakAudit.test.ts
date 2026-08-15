import { describe, it, expect, vi, beforeEach } from "vitest";
import { getInbox } from "../../src/services/direct-chat/getInbox";
import { getMembers } from "../../src/services/room/getMembers";
import { prismaMock, resetPrismaMock } from "../mocks/prisma";

// ---------------------------------------------------------------------------
// Presence leak audit
// ---------------------------------------------------------------------------
//
// Presence/status must only ever reach a client through the gated
// `presence:changed` socket event. Any REST endpoint that returns another
// user's data must therefore NEVER select or serialize presence fields.
// This file is the tripwire: if a future refactor adds `status` or presence
// to one of these serializations, these tests fail.

const PRESENCE_FIELD_MARKERS = [
  "status",
  "presence",
  "customStatus",
  "showOnlineStatus",
  "showTypingStatus",
  "lastActiveAt",
];

function assertSelectLeakFree(select: unknown, context: string): void {
  const serialized = JSON.stringify(select);
  for (const marker of PRESENCE_FIELD_MARKERS) {
    expect(
      serialized.includes(marker),
      `${context} must not select "${marker}"`,
    ).toBe(false);
  }
}

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
});

describe("REST presence leak audit", () => {
  it("inbox otherUser serialization never selects presence fields", async () => {
    prismaMock.directChat.findMany.mockResolvedValue([
      {
        id: "dc1",
        user1Id: "u1",
        user2Id: "u2",
        createdAt: new Date(),
        User_DirectChat_user1IdToUser: {
          id: "u1",
          username: "user1",
          avatar: null,
        },
        User_DirectChat_user2IdToUser: {
          id: "u2",
          username: "user2",
          avatar: null,
        },
        Message: [],
      },
    ] as any);
    prismaMock.$queryRaw.mockResolvedValue([] as any);

    const { inbox } = await getInbox("u1", {});

    const call = prismaMock.directChat.findMany.mock.calls[0]![0] as any;
    assertSelectLeakFree(call.select, "getInbox");

    const otherUser = inbox[0]!.otherUser as Record<string, unknown>;
    expect(Object.keys(otherUser).sort()).toEqual(["avatar", "id", "username"]);
  });

  it("room member user serialization never selects presence fields", async () => {
    prismaMock.chatRoomMember.findMany.mockResolvedValue([
      {
        id: "m1",
        role: "MEMBER",
        joinedAt: new Date(),
        User: {
          id: "u2",
          username: "user2",
          displayName: "User Two",
          avatar: null,
        },
      },
    ] as any);

    const members = await getMembers("room-1");

    const call = prismaMock.chatRoomMember.findMany.mock.calls[0]![0] as any;
    assertSelectLeakFree(call.select, "getMembers");

    const user = members[0]!.user as Record<string, unknown>;
    expect(Object.keys(user).sort()).toEqual([
      "avatar",
      "displayName",
      "id",
      "username",
    ]);
  });
});
