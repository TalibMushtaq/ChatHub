import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteMessage } from "../../../../src/services/direct-chat/deleteMessage";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";
import { createMessage } from "../../../factories/room";
import { ApiError } from "../../../../src/lib/ApiError";
import { DELETE_WINDOW_MS } from "../../../../src/constants/direct-chat";

describe("deleteMessage", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should soft-delete a message the user owns within the window", async () => {
    const msg = createMessage({
      senderId: "u1",
      directChatId: "dc1",
      isDeleted: false,
      createdAt: new Date(Date.now() - 1000),
    });
    prismaMock.message.findUnique.mockResolvedValue(msg);
    prismaMock.message.update.mockResolvedValue({
      id: msg.id,
      directChatId: msg.directChatId,
      deletedAt: new Date(),
    } as any);

    const result = await deleteMessage("u1", msg.id);

    expect(prismaMock.message.findUnique).toHaveBeenCalledWith({
      where: { id: msg.id },
      select: expect.any(Object),
    });
    expect(prismaMock.message.update).toHaveBeenCalledWith({
      where: { id: msg.id },
      data: { isDeleted: true, deletedAt: expect.any(Date), content: null },
      select: { id: true, directChatId: true, deletedAt: true },
    });
    expect(result.id).toBe(msg.id);
  });

  it("should throw 404 when message does not exist", async () => {
    prismaMock.message.findUnique.mockResolvedValue(null);

    await expect(deleteMessage("u1", "m1")).rejects.toThrow(ApiError);
    await expect(deleteMessage("u1", "m1")).rejects.toMatchObject({
      statusCode: 404,
      code: "MESSAGE_NOT_FOUND",
    });
  });

  it("should throw 403 when user is not the sender", async () => {
    const msg = createMessage({ senderId: "u2" });
    prismaMock.message.findUnique.mockResolvedValue(msg);

    await expect(deleteMessage("u1", msg.id)).rejects.toThrow(ApiError);
    await expect(deleteMessage("u1", msg.id)).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });

  it("should throw 400 when message is already deleted", async () => {
    const msg = createMessage({ senderId: "u1", isDeleted: true });
    prismaMock.message.findUnique.mockResolvedValue(msg);

    await expect(deleteMessage("u1", msg.id)).rejects.toThrow(ApiError);
    await expect(deleteMessage("u1", msg.id)).rejects.toMatchObject({
      statusCode: 400,
      code: "ALREADY_DELETED",
    });
  });

  it("should throw 403 when delete window has expired", async () => {
    const msg = createMessage({
      senderId: "u1",
      isDeleted: false,
      createdAt: new Date(Date.now() - DELETE_WINDOW_MS - 1),
    });
    prismaMock.message.findUnique.mockResolvedValue(msg);

    await expect(deleteMessage("u1", msg.id)).rejects.toThrow(ApiError);
    await expect(deleteMessage("u1", msg.id)).rejects.toMatchObject({
      statusCode: 403,
      code: "DELETE_WINDOW_EXPIRED",
    });
  });
});
