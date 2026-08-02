import { describe, it, expect, vi, beforeEach } from "vitest";
import { editMessage } from "../../../../src/services/direct-chat/editMessage";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";
import { createMessage } from "../../../factories/room";
import { ApiError } from "../../../../src/lib/ApiError";
import { EDIT_WINDOW_MS } from "../../../../src/constants/direct-chat";

describe("editMessage", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should edit a message the user owns within the window", async () => {
    const msg = createMessage({
      senderId: "u1",
      directChatId: "dc1",
      isDeleted: false,
      createdAt: new Date(Date.now() - 1000),
      content: "old",
    });
    prismaMock.message.findUnique.mockResolvedValue(msg);
    prismaMock.message.update.mockResolvedValue({
      id: msg.id,
      content: "new",
      editedAt: new Date(),
      directChatId: msg.directChatId,
    } as any);

    const result = await editMessage("u1", msg.id, "new");

    expect(prismaMock.message.update).toHaveBeenCalledWith({
      where: { id: msg.id },
      data: { content: "new", editedAt: expect.any(Date) },
      select: { id: true, content: true, editedAt: true, directChatId: true },
    });
    expect(result.content).toBe("new");
  });

  it("should throw 404 when message does not exist", async () => {
    prismaMock.message.findUnique.mockResolvedValue(null);

    await expect(editMessage("u1", "m1", "x")).rejects.toThrow(ApiError);
    await expect(editMessage("u1", "m1", "x")).rejects.toMatchObject({
      statusCode: 404,
      code: "MESSAGE_NOT_FOUND",
    });
  });

  it("should throw 404 when message is already deleted", async () => {
    const msg = createMessage({ senderId: "u1", isDeleted: true });
    prismaMock.message.findUnique.mockResolvedValue(msg);

    await expect(editMessage("u1", msg.id, "x")).rejects.toThrow(ApiError);
    await expect(editMessage("u1", msg.id, "x")).rejects.toMatchObject({
      statusCode: 404,
      code: "MESSAGE_NOT_FOUND",
    });
  });

  it("should throw 403 when user is not the sender", async () => {
    const msg = createMessage({ senderId: "u2" });
    prismaMock.message.findUnique.mockResolvedValue(msg);

    await expect(editMessage("u1", msg.id, "x")).rejects.toThrow(ApiError);
    await expect(editMessage("u1", msg.id, "x")).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });

  it("should throw 403 when edit window has expired", async () => {
    const msg = createMessage({
      senderId: "u1",
      isDeleted: false,
      createdAt: new Date(Date.now() - EDIT_WINDOW_MS - 1),
    });
    prismaMock.message.findUnique.mockResolvedValue(msg);

    await expect(editMessage("u1", msg.id, "x")).rejects.toThrow(ApiError);
    await expect(editMessage("u1", msg.id, "x")).rejects.toMatchObject({
      statusCode: 403,
      code: "EDIT_WINDOW_EXPIRED",
    });
  });
});
