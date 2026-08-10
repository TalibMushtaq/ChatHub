import { describe, it, expect, vi, beforeEach } from "vitest";
import { markDirectChatRead } from "../../../../src/services/direct-chat/markRead";
import {
  prismaMock,
  resetPrismaMock,
  createMockTransaction,
} from "../../../mocks/prisma";
import { createMessage } from "../../../factories/room";

describe("markDirectChatRead", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should create a new receipt and return unreadCount when no prior receipt exists", async () => {
    const msg = createMessage({
      id: "msg-1",
      directChatId: "dc1",
      createdAt: new Date("2026-01-10T12:00:00Z"),
    });

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(msg as any);
    prismaMock.directChatReadReceipt.findUnique.mockResolvedValue(null);
    prismaMock.directChatReadReceipt.upsert.mockResolvedValue({} as any);
    prismaMock.message.count.mockResolvedValue(3);

    const result = await markDirectChatRead("u1", "dc1", "msg-1");

    expect(result).toEqual({ lastReadMessageId: "msg-1", unreadCount: 3 });
    expect(prismaMock.directChatReadReceipt.upsert).toHaveBeenCalledWith({
      where: { userId_directChatId: { userId: "u1", directChatId: "dc1" } },
      create: {
        userId: "u1",
        directChatId: "dc1",
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
      directChatId: "dc1",
      createdAt: new Date("2026-01-10T14:00:00Z"),
    });

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(msg as any);
    prismaMock.directChatReadReceipt.findUnique.mockResolvedValue({
      lastReadMessageCreatedAt: new Date("2026-01-10T12:00:00Z"),
    });
    prismaMock.directChatReadReceipt.upsert.mockResolvedValue({} as any);
    prismaMock.message.count.mockResolvedValue(1);

    const result = await markDirectChatRead("u1", "dc1", "msg-3");

    expect(result).toEqual({ lastReadMessageId: "msg-3", unreadCount: 1 });
    expect(prismaMock.directChatReadReceipt.upsert).toHaveBeenCalled();
  });

  it("should NOT update the receipt when cursor would move backwards", async () => {
    const msg = createMessage({
      id: "msg-1",
      directChatId: "dc1",
      createdAt: new Date("2026-01-10T10:00:00Z"),
    });

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(msg as any);
    prismaMock.directChatReadReceipt.findUnique.mockResolvedValue({
      lastReadMessageCreatedAt: new Date("2026-01-10T12:00:00Z"),
    });
    prismaMock.message.count.mockResolvedValue(0);

    const result = await markDirectChatRead("u1", "dc1", "msg-1");

    expect(result).toEqual({ lastReadMessageId: "msg-1", unreadCount: 0 });
    expect(prismaMock.directChatReadReceipt.upsert).not.toHaveBeenCalled();
  });

  it("should NOT update the receipt when cursor is at the same position", async () => {
    const msg = createMessage({
      id: "msg-2",
      directChatId: "dc1",
      createdAt: new Date("2026-01-10T12:00:00Z"),
    });

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(msg as any);
    prismaMock.directChatReadReceipt.findUnique.mockResolvedValue({
      lastReadMessageCreatedAt: new Date("2026-01-10T12:00:00Z"),
    });
    prismaMock.message.count.mockResolvedValue(0);

    const result = await markDirectChatRead("u1", "dc1", "msg-2");

    expect(result).toEqual({ lastReadMessageId: "msg-2", unreadCount: 0 });
    expect(prismaMock.directChatReadReceipt.upsert).not.toHaveBeenCalled();
  });

  it("should throw MESSAGE_NOT_FOUND when the message does not exist", async () => {
    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(null);

    await expect(
      markDirectChatRead("u1", "dc1", "nonexistent"),
    ).rejects.toThrow("Message not found");
  });

  it("should throw MESSAGE_WRONG_CHAT when the message belongs to a different chat", async () => {
    const msg = createMessage({
      id: "msg-1",
      directChatId: "other-dc",
      createdAt: new Date("2026-01-10T12:00:00Z"),
    });

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(msg as any);

    await expect(markDirectChatRead("u1", "dc1", "msg-1")).rejects.toThrow(
      "Message does not belong to this conversation",
    );
  });

  it("should compute unread count excluding own messages", async () => {
    const msg = createMessage({
      id: "msg-5",
      directChatId: "dc1",
      senderId: "u2",
      createdAt: new Date("2026-01-10T15:00:00Z"),
    });

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(msg as any);
    prismaMock.directChatReadReceipt.findUnique.mockResolvedValue(null);
    prismaMock.directChatReadReceipt.upsert.mockResolvedValue({} as any);
    prismaMock.message.count.mockResolvedValue(2);

    const result = await markDirectChatRead("u1", "dc1", "msg-5");

    expect(result.unreadCount).toBe(2);
    // Must match the isDeleted filter used by the inbox unread query,
    // otherwise the two counts disagree for a chat with soft deletes.
    expect(prismaMock.message.count).toHaveBeenCalledWith({
      where: {
        directChatId: "dc1",
        senderId: { not: "u1" },
        isDeleted: false,
        createdAt: { gt: new Date("2026-01-10T15:00:00Z") },
      },
    });
  });

  it("should return unreadCount 0 when all messages after cursor are from self", async () => {
    const msg = createMessage({
      id: "msg-5",
      directChatId: "dc1",
      senderId: "u1",
      createdAt: new Date("2026-01-10T15:00:00Z"),
    });

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.findUnique.mockResolvedValue(msg as any);
    prismaMock.directChatReadReceipt.findUnique.mockResolvedValue(null);
    prismaMock.directChatReadReceipt.upsert.mockResolvedValue({} as any);
    prismaMock.message.count.mockResolvedValue(0);

    const result = await markDirectChatRead("u1", "dc1", "msg-5");

    expect(result.unreadCount).toBe(0);
  });
});
