import { describe, it, expect, vi, beforeEach } from "vitest";
import { getInbox } from "../../../../src/services/direct-chat/getInbox";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";
import { createDirectChat, createMessage } from "../../../factories/room";

describe("getInbox", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should return inbox entries for the user's chats", async () => {
    const dc1 = createDirectChat({ user1Id: "u1", user2Id: "u2" });
    const dc2 = createDirectChat({ user1Id: "u3", user2Id: "u1" });

    prismaMock.directChat.findMany.mockResolvedValue([
      {
        ...dc1,
        User_DirectChat_user1IdToUser: { id: dc1.user1Id, username: "user1", avatar: null },
        User_DirectChat_user2IdToUser: { id: dc1.user2Id, username: "user2", avatar: null },
        Message: [],
      },
      {
        ...dc2,
        User_DirectChat_user1IdToUser: { id: dc2.user1Id, username: "user3", avatar: null },
        User_DirectChat_user2IdToUser: { id: dc2.user2Id, username: "user1", avatar: null },
        Message: [createMessage({ content: "hi" })],
      },
    ] as any);

    const inbox = await getInbox("u1");

    expect(inbox).toHaveLength(2);
    expect(inbox[0]?.otherUser.id).toBe("u2");
    expect(inbox[1]?.otherUser.id).toBe("u3");
    expect(inbox[1]?.lastMessage).not.toBeNull();
    expect(prismaMock.directChat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ user1Id: "u1" }, { user2Id: "u1" }] },
      }),
    );
  });

  it("should return empty array when user has no chats", async () => {
    prismaMock.directChat.findMany.mockResolvedValue([]);

    const inbox = await getInbox("u1");

    expect(inbox).toEqual([]);
  });

  it("should map otherUser correctly based on user position", async () => {
    const dc = createDirectChat({ user1Id: "u1", user2Id: "u2" });
    prismaMock.directChat.findMany.mockResolvedValue([
      {
        ...dc,
        User_DirectChat_user1IdToUser: { id: "u1", username: "a", avatar: null },
        User_DirectChat_user2IdToUser: { id: "u2", username: "b", avatar: null },
        Message: [],
      },
    ] as any);

    const inbox = await getInbox("u1");
    expect(inbox[0]?.otherUser.id).toBe("u2");

    const inbox2 = await getInbox("u2");
    expect(inbox2[0]?.otherUser.id).toBe("u1");
  });
});
