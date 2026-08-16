import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { acceptFriendRequest } from "../../../../src/services/friends/acceptFriendRequest";
import {
  prismaMock,
  resetPrismaMock,
  createMockTransaction,
} from "../../../mocks/prisma";
import { ApiError } from "../../../../src/lib/ApiError";
import { createUser } from "../../../factories/user";

describe("acceptFriendRequest", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
  });

  it("throws 404 when the request is missing, not pending, or not addressed to the caller", async () => {
    prismaMock.friendRequest.findFirst.mockResolvedValue(null);

    await expect(acceptFriendRequest("u2", "fr1")).rejects.toMatchObject({
      statusCode: 404,
      code: "REQUEST_NOT_FOUND",
    });
  });

  it("throws 403 when the recipient has blocked the sender since receiving", async () => {
    prismaMock.friendRequest.findFirst.mockResolvedValue({
      id: "fr1",
      senderId: "u1",
      recipientId: "u2",
    } as any);
    prismaMock.userBlock.findFirst.mockResolvedValue({ id: "b1" } as any);

    await expect(acceptFriendRequest("u2", "fr1")).rejects.toMatchObject({
      statusCode: 403,
      code: "BLOCKED",
    });
  });

  it("accepts the request and creates a normalized friendship in one transaction", async () => {
    prismaMock.friendRequest.findFirst.mockResolvedValue({
      id: "fr1",
      senderId: "u2",
      recipientId: "u1",
    } as any);
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.update.mockResolvedValue({
      id: "fr1",
      status: "ACCEPTED",
      senderId: "u2",
      recipientId: "u1",
      sender: createUser({ id: "u2" }),
      recipient: createUser({ id: "u1" }),
    } as any);
    prismaMock.friendship.create.mockResolvedValue({ id: "f1" } as any);

    const result = await acceptFriendRequest("u1", "fr1");

    expect(prismaMock.friendRequest.update).toHaveBeenCalledWith({
      where: { id: "fr1" },
      data: { status: "ACCEPTED" },
      select: expect.any(Object),
    });
    // Sender u2 > recipient u1, so the friendship is stored as u1|u2.
    expect(prismaMock.friendship.create).toHaveBeenCalledWith({
      data: { userAId: "u1", userBId: "u2" },
      select: { id: true },
    });
    expect(result.status).toBe("ACCEPTED");
  });

  it("treats a duplicate-friendship race (P2002) as idempotent success", async () => {
    prismaMock.friendRequest.findFirst.mockResolvedValue({
      id: "fr1",
      senderId: "u1",
      recipientId: "u2",
    } as any);
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.update.mockResolvedValue({
      id: "fr1",
      status: "ACCEPTED",
      senderId: "u1",
      recipientId: "u2",
      sender: createUser({ id: "u1" }),
      recipient: createUser({ id: "u2" }),
    } as any);
    prismaMock.friendship.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "1",
      }),
    );
    prismaMock.friendRequest.findUnique.mockResolvedValue({
      id: "fr1",
      status: "ACCEPTED",
      senderId: "u1",
      recipientId: "u2",
      sender: createUser({ id: "u1" }),
      recipient: createUser({ id: "u2" }),
    } as any);

    const result = await acceptFriendRequest("u2", "fr1");

    expect(result.status).toBe("ACCEPTED");
    expect(prismaMock.friendRequest.findUnique).toHaveBeenCalled();
  });

  it("rethrows unexpected Prisma errors", async () => {
    prismaMock.friendRequest.findFirst.mockResolvedValue({
      id: "fr1",
      senderId: "u1",
      recipientId: "u2",
    } as any);
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.update.mockResolvedValue({} as any);
    const boom = new Error("DB outage");
    prismaMock.friendship.create.mockRejectedValue(boom);

    await expect(acceptFriendRequest("u2", "fr1")).rejects.toBe(boom);
  });

  it("throws ApiError 404 when the request disappears during the race fallback", async () => {
    prismaMock.friendRequest.findFirst.mockResolvedValue({
      id: "fr1",
      senderId: "u1",
      recipientId: "u2",
    } as any);
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.update.mockResolvedValue({} as any);
    prismaMock.friendship.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "1",
      }),
    );
    prismaMock.friendRequest.findUnique.mockResolvedValue(null);

    await expect(acceptFriendRequest("u2", "fr1")).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
