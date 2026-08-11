import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMembers } from "../../../../src/services/room/getMembers";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";
import { createChatRoomMember } from "../../../factories/room";

describe("getMembers", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should return members ordered by role then joinedAt with user info", async () => {
    const member = createChatRoomMember({
      id: "m1",
      role: "OWNER",
    });
    prismaMock.chatRoomMember.findMany.mockResolvedValue([
      {
        ...member,
        joinedAt: new Date("2024-01-01T00:00:00Z"),
        User: {
          id: "u1",
          username: "alice",
          displayname: "Alice",
          avatar: null,
        },
      },
    ] as any);

    const result = await getMembers("r1");

    expect(prismaMock.chatRoomMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { chatRoomId: "r1" },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      }),
    );
    expect(result).toEqual([
      {
        memberId: "m1",
        role: "OWNER",
        joinedAt: new Date("2024-01-01T00:00:00Z"),
        user: {
          id: "u1",
          username: "alice",
          displayname: "Alice",
          avatar: null,
        },
      },
    ]);
  });

  it("should return an empty array when the room has no members", async () => {
    prismaMock.chatRoomMember.findMany.mockResolvedValue([]);

    const result = await getMembers("r1");

    expect(result).toEqual([]);
  });
});
