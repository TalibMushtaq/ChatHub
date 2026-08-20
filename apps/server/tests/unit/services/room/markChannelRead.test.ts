import { describe, it, expect, vi, beforeEach } from "vitest";
import { markChannelRead } from "../../../../src/services/room/markChannelRead";
import {
  prismaMock,
  resetPrismaMock,
  createMockTransaction,
} from "../../../mocks/prisma";
import { createMessage } from "../../../factories/room";

describe("markChannelRead", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should create a new receipt and return unreadCount when no prior receipt exists", async () => {
    const msg = {
      ...createMessage({
        id: "msg-1",
        chatRoomId: "room1",
        createdAt: new Date("2026-01-10T12:00:00Z"),
      }),
      channelId: "ch1",
    };

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(msg as any);
    prismaMock.channelReadReceipt.findUnique.mockResolvedValue(null);
    prismaMock.channelReadReceipt.upsert.mockResolvedValue({} as any);
    prismaMock.message.count.mockResolvedValue(5);

    const result = await markChannelRead("u1", "ch1", "msg-1");

    expect(result).toEqual({
      lastReadMessageId: "msg-1",
      lastReadMessageCreatedAt: new Date("2026-01-10T12:00:00Z"),
      unreadCount: 5,
    });
    // Scopes the cursor to the channel, not the whole room.
    expect(prismaMock.channelReadReceipt.upsert).toHaveBeenCalledWith({
      where: { userId_channelId: { userId: "u1", channelId: "ch1" } },
      create: {
        userId: "u1",
        channelId: "ch1",
        lastReadMessageId: "msg-1",
        lastReadMessageCreatedAt: new Date("2026-01-10T12:00:00Z"),
      },
      update: {
        lastReadMessageId: "msg-1",
        lastReadMessageCreatedAt: new Date("2026-01-10T12:00:00Z"),
      },
    });
  });

  it("should advance the cursor when incoming message is newer than existing receipt", async () => {
    const msg = {
      ...createMessage({
        id: "msg-3",
        chatRoomId: "room1",
        createdAt: new Date("2026-01-10T14:00:00Z"),
      }),
      channelId: "ch1",
    };

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(msg as any);
    prismaMock.channelReadReceipt.findUnique.mockResolvedValue({
      lastReadMessageCreatedAt: new Date("2026-01-10T12:00:00Z"),
    });
    prismaMock.channelReadReceipt.upsert.mockResolvedValue({} as any);
    prismaMock.message.count.mockResolvedValue(2);

    const result = await markChannelRead("u1", "ch1", "msg-3");

    expect(result.unreadCount).toBe(2);
    expect(result.lastReadMessageCreatedAt).toEqual(
      new Date("2026-01-10T14:00:00Z"),
    );
    expect(prismaMock.channelReadReceipt.upsert).toHaveBeenCalled();
  });

  it("should NOT update the receipt when cursor would move backwards", async () => {
    const msg = {
      ...createMessage({
        id: "msg-1",
        chatRoomId: "room1",
        createdAt: new Date("2026-01-10T10:00:00Z"),
      }),
      channelId: "ch1",
    };

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(msg as any);
    prismaMock.channelReadReceipt.findUnique.mockResolvedValue({
      lastReadMessageCreatedAt: new Date("2026-01-10T12:00:00Z"),
    });
    prismaMock.message.count.mockResolvedValue(0);

    const result = await markChannelRead("u1", "ch1", "msg-1");

    expect(result.lastReadMessageCreatedAt).toEqual(
      new Date("2026-01-10T12:00:00Z"),
    );
    expect(prismaMock.channelReadReceipt.upsert).not.toHaveBeenCalled();
  });

  it("should throw MESSAGE_NOT_FOUND when the message does not exist", async () => {
    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(null);

    await expect(markChannelRead("u1", "ch1", "nonexistent")).rejects.toThrow(
      "Message not found",
    );
  });

  it("should throw MESSAGE_WRONG_CHANNEL when the message belongs to a different channel", async () => {
    const msg = {
      ...createMessage({
        id: "msg-1",
        chatRoomId: "room1",
        createdAt: new Date("2026-01-10T12:00:00Z"),
      }),
      channelId: "other-channel",
    };

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(msg as any);

    await expect(markChannelRead("u1", "ch1", "msg-1")).rejects.toThrow(
      "Message does not belong to this channel",
    );
  });

  it("should compute unread count excluding own and soft-deleted messages", async () => {
    const msg = {
      ...createMessage({
        id: "msg-5",
        chatRoomId: "room1",
        senderId: "other-user",
        createdAt: new Date("2026-01-10T15:00:00Z"),
      }),
      channelId: "ch1",
    };

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(msg as any);
    prismaMock.channelReadReceipt.findUnique.mockResolvedValue(null);
    prismaMock.channelReadReceipt.upsert.mockResolvedValue({} as any);
    prismaMock.message.count.mockResolvedValue(4);

    const result = await markChannelRead("u1", "ch1", "msg-5");

    expect(result.unreadCount).toBe(4);
    expect(prismaMock.message.count).toHaveBeenCalledWith({
      where: {
        channelId: "ch1",
        senderId: { not: "u1" },
        isDeleted: false,
        createdAt: { gt: new Date("2026-01-10T15:00:00Z") },
      },
    });
  });
});
