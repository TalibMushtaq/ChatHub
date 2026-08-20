import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getRoomsChannelUnreads,
  getChannelUnreadState,
} from "../../../../src/services/room/channelUnread";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

describe("getRoomsChannelUnreads", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("returns an empty array when there are no rooms", async () => {
    const result = await getRoomsChannelUnreads("u1", []);

    expect(result).toEqual([]);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it("maps raw unread + mention rows into per-channel state per room", async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        { channelId: "ch1", roomId: "room1", count: 3 },
        { channelId: "ch2", roomId: "room1", count: 1 },
        { channelId: "ch9", roomId: "room2", count: 7 },
      ] as any)
      .mockResolvedValueOnce([
        { channelId: "ch1", roomId: "room1", count: 2 },
        { channelId: "ch2", roomId: "room2", count: 1 },
      ] as any);

    const result = await getRoomsChannelUnreads("u1", ["room1", "room2"]);

    expect(result).toEqual([
      {
        roomId: "room1",
        channels: {
          ch1: { unreadCount: 3, mentionCount: 2 },
          ch2: { unreadCount: 1, mentionCount: 0 },
        },
      },
      {
        roomId: "room2",
        channels: {
          ch2: { unreadCount: 0, mentionCount: 1 },
          ch9: { unreadCount: 7, mentionCount: 0 },
        },
      },
    ]);
    // Both batched queries run with the caller's userId bound.
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("returns empty channel maps for rooms with no unread rows", async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);

    const result = await getRoomsChannelUnreads("u1", ["room1"]);

    expect(result).toEqual([{ roomId: "room1", channels: {} }]);
  });
});

describe("getChannelUnreadState", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("counts all messages after the receipt cursor, filtering own and deleted", async () => {
    const after = new Date("2026-01-10T12:00:00Z");
    prismaMock.channelReadReceipt.findUnique.mockResolvedValue({
      lastReadMessageCreatedAt: after,
    } as any);
    prismaMock.message.count.mockResolvedValue(4);
    prismaMock.messageMention.count.mockResolvedValue(1);

    const result = await getChannelUnreadState("u1", "ch1");

    expect(result).toEqual({ unreadCount: 4, mentionCount: 1 });
    expect(prismaMock.message.count).toHaveBeenCalledWith({
      where: {
        channelId: "ch1",
        senderId: { not: "u1" },
        isDeleted: false,
        createdAt: { gt: after },
      },
    });
    expect(prismaMock.messageMention.count).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        channelId: "ch1",
        Message: {
          senderId: { not: "u1" },
          isDeleted: false,
          createdAt: { gt: after },
        },
      },
    });
  });

  it("omits the createdAt filter when no receipt exists yet", async () => {
    prismaMock.channelReadReceipt.findUnique.mockResolvedValue(null);
    prismaMock.message.count.mockResolvedValue(0);
    prismaMock.messageMention.count.mockResolvedValue(0);

    const result = await getChannelUnreadState("u1", "ch1");

    expect(result).toEqual({ unreadCount: 0, mentionCount: 0 });
    expect(prismaMock.message.count).toHaveBeenCalledWith({
      where: {
        channelId: "ch1",
        senderId: { not: "u1" },
        isDeleted: false,
      },
    });
  });
});
