import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteMessage } from "../../../../src/services/room/deleteMessage";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";
import { createMessage } from "../../../factories/room";
import { DELETE_WINDOW_MS } from "../../../../src/constants/room";

describe("deleteMessage (room)", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should soft-delete the message and clear its content", async () => {
    prismaMock.message.findFirst.mockResolvedValue(
      createMessage({
        id: "msg-1",
        senderId: "u1",
        chatRoomId: "r1",
        createdAt: new Date(),
      }) as any,
    );
    prismaMock.message.update.mockResolvedValue({
      id: "msg-1",
      chatRoomId: "r1",
      deletedAt: new Date(),
    } as any);

    const result = await deleteMessage("u1", "r1", "msg-1");

    expect(prismaMock.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "msg-1" },
        data: {
          isDeleted: true,
          deletedAt: expect.any(Date),
          content: null,
        },
      }),
    );
    expect(result.id).toBe("msg-1");
  });

  it("should reject a missing message with 404", async () => {
    prismaMock.message.findFirst.mockResolvedValue(null);

    await expect(deleteMessage("u1", "r1", "missing")).rejects.toMatchObject({
      statusCode: 404,
      code: "MESSAGE_NOT_FOUND",
    });
    expect(prismaMock.message.update).not.toHaveBeenCalled();
  });

  it("should reject deletion by a user other than the sender", async () => {
    prismaMock.message.findFirst.mockResolvedValue(
      createMessage({ id: "msg-1", senderId: "u2", chatRoomId: "r1" }) as any,
    );

    await expect(deleteMessage("u1", "r1", "msg-1")).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });

  it("should reject an already-deleted message", async () => {
    prismaMock.message.findFirst.mockResolvedValue(
      createMessage({
        id: "msg-1",
        senderId: "u1",
        chatRoomId: "r1",
        isDeleted: true,
      }) as any,
    );

    await expect(deleteMessage("u1", "r1", "msg-1")).rejects.toMatchObject({
      statusCode: 400,
      code: "ALREADY_DELETED",
    });
  });

  it("should reject deletion after the delete window has expired", async () => {
    prismaMock.message.findFirst.mockResolvedValue(
      createMessage({
        id: "msg-1",
        senderId: "u1",
        chatRoomId: "r1",
        createdAt: new Date(Date.now() - DELETE_WINDOW_MS - 1000),
      }) as any,
    );

    await expect(deleteMessage("u1", "r1", "msg-1")).rejects.toMatchObject({
      statusCode: 403,
      code: "DELETE_WINDOW_EXPIRED",
    });
  });
});
