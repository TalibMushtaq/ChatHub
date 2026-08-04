import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendMessage } from "../../../../src/services/direct-chat/sendMessage";
import {
  prismaMock,
  resetPrismaMock,
  createMockTransaction,
} from "../../../mocks/prisma";
import { createMessage } from "../../../factories/room";

describe("sendMessage", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should create a message and bump lastMessageAt atomically", async () => {
    const msg = createMessage({
      directChatId: "dc1",
      senderId: "u1",
      content: "hi",
    });
    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.create.mockResolvedValue(msg as any);
    prismaMock.directChat.update.mockResolvedValue({ id: "dc1" } as any);

    const result = await sendMessage("dc1", "u1", {
      content: "hi",
      messageType: "TEXT",
    });

    expect(prismaMock.message.create).toHaveBeenCalledWith({
      data: {
        content: "hi",
        senderId: "u1",
        directChatId: "dc1",
        messageType: "TEXT",
      },
      select: expect.any(Object),
    });
    expect(prismaMock.directChat.update).toHaveBeenCalledWith({
      where: { id: "dc1" },
      data: { lastMessageAt: expect.any(Date) },
    });
    expect(result).toEqual(msg);
  });

  it("should use the transaction callback correctly", async () => {
    const msg = createMessage();
    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.create.mockResolvedValue(msg as any);
    prismaMock.directChat.update.mockResolvedValue({} as any);

    await sendMessage("dc1", "u1", {
      content: "hello",
      messageType: "TEXT",
    });

    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    const fn = prismaMock.$transaction.mock.calls[0]![0];
    expect(typeof fn).toBe("function");
  });
});
