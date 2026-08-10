import { describe, it, expect, vi, beforeEach } from "vitest";
import { markRoomRead } from "../../../../src/services/room/markRead";
import {
  prismaMock,
  resetPrismaMock,
  createMockTransaction,
} from "../../../mocks/prisma";
import { createMessage } from "../../../factories/room";

describe("markRoomRead", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should create a new receipt and return unreadCount when no prior receipt exists", async () => {
    const msg = createMessage({
      id: "msg-1",
      chatRoomId: "room1",
      createdAt: new Date("2026-01-10T12:00:00Z"),
    });

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(msg as any);
    prismaMock.chatRoomReadReceipt.findUnique.mockResolvedValue(null);
    prismaMock.chatRoomReadReceipt.upsert.mockResolvedValue({} as any);
    prismaMock.message.count.mockResolvedValue(5);

    const result = await markRoomRead("u1", "room1", "msg-1");

    expect(result).toEqual({ lastReadMessageId: "msg-1", unreadCount: 5 });
    expect(prismaMock.chatRoomReadReceipt.upsert).toHaveBeenCalledWith({
      where: { userId_chatRoomId: { userId: "u1", chatRoomId: "room1" } },
      create: {
        userId: "u1",
        chatRoomId: "room1",
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
    const msg = createMessage({
      id: "msg-3",
      chatRoomId: "room1",
      createdAt: new Date("2026-01-10T14:00:00Z"),
    });

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(msg as any);
    prismaMock.chatRoomReadReceipt.findUnique.mockResolvedValue({
      lastReadMessageCreatedAt: new Date("2026-01-10T12:00:00Z"),
    });
    prismaMock.chatRoomReadReceipt.upsert.mockResolvedValue({} as any);
    prismaMock.message.count.mockResolvedValue(2);

    const result = await markRoomRead("u1", "room1", "msg-3");

    expect(result).toEqual({ lastReadMessageId: "msg-3", unreadCount: 2 });
    expect(prismaMock.chatRoomReadReceipt.upsert).toHaveBeenCalled();
  });

  it("should NOT update the receipt when cursor would move backwards", async () => {
    const msg = createMessage({
      id: "msg-1",
      chatRoomId: "room1",
      createdAt: new Date("2026-01-10T10:00:00Z"),
    });

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(msg as any);
    prismaMock.chatRoomReadReceipt.findUnique.mockResolvedValue({
      lastReadMessageCreatedAt: new Date("2026-01-10T12:00:00Z"),
    });
    prismaMock.message.count.mockResolvedValue(0);

    const result = await markRoomRead("u1", "room1", "msg-1");

    expect(result).toEqual({ lastReadMessageId: "msg-1", unreadCount: 0 });
    expect(prismaMock.chatRoomReadReceipt.upsert).not.toHaveBeenCalled();
  });

  it("should NOT update the receipt when cursor is at the same position", async () => {
    const msg = createMessage({
      id: "msg-2",
      chatRoomId: "room1",
      createdAt: new Date("2026-01-10T12:00:00Z"),
    });

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(msg as any);
    prismaMock.chatRoomReadReceipt.findUnique.mockResolvedValue({
      lastReadMessageCreatedAt: new Date("2026-01-10T12:00:00Z"),
    });
    prismaMock.message.count.mockResolvedValue(0);

    const result = await markRoomRead("u1", "room1", "msg-2");

    expect(result).toEqual({ lastReadMessageId: "msg-2", unreadCount: 0 });
    expect(prismaMock.chatRoomReadReceipt.upsert).not.toHaveBeenCalled();
  });

  it("should throw MESSAGE_NOT_FOUND when the message does not exist", async () => {
    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(null);

    await expect(markRoomRead("u1", "room1", "nonexistent")).rejects.toThrow(
      "Message not found",
    );
  });

  it("should throw MESSAGE_WRONG_ROOM when the message belongs to a different room", async () => {
    const msg = createMessage({
      id: "msg-1",
      chatRoomId: "other-room",
      createdAt: new Date("2026-01-10T12:00:00Z"),
    });

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(msg as any);

    await expect(markRoomRead("u1", "room1", "msg-1")).rejects.toThrow(
      "Message does not belong to this room",
    );
  });

  it("should compute unread count excluding own and soft-deleted messages", async () => {
    const msg = createMessage({
      id: "msg-5",
      chatRoomId: "room1",
      senderId: "other-user",
      createdAt: new Date("2026-01-10T15:00:00Z"),
    });

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(msg as any);
    prismaMock.chatRoomReadReceipt.findUnique.mockResolvedValue(null);
    prismaMock.chatRoomReadReceipt.upsert.mockResolvedValue({} as any);
    prismaMock.message.count.mockResolvedValue(4);

    const result = await markRoomRead("u1", "room1", "msg-5");

    expect(result.unreadCount).toBe(4);
    // Must match the isDeleted filter used by the rooms-list unread query,
    // otherwise the two counts disagree for a conversation with soft deletes.
    expect(prismaMock.message.count).toHaveBeenCalledWith({
      where: {
        chatRoomId: "room1",
        senderId: { not: "u1" },
        isDeleted: false,
        createdAt: { gt: new Date("2026-01-10T15:00:00Z") },
      },
    });
  });

  it("should return unreadCount 0 when all messages after cursor are from self", async () => {
    const msg = createMessage({
      id: "msg-5",
      chatRoomId: "room1",
      senderId: "u1",
      createdAt: new Date("2026-01-10T15:00:00Z"),
    });

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(msg as any);
    prismaMock.chatRoomReadReceipt.findUnique.mockResolvedValue(null);
    prismaMock.chatRoomReadReceipt.upsert.mockResolvedValue({} as any);
    prismaMock.message.count.mockResolvedValue(0);

    const result = await markRoomRead("u1", "room1", "msg-5");

    expect(result.unreadCount).toBe(0);
  });
});
