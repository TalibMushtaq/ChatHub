import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { blockUser } from "../../../../src/services/friends/blockUser";
import {
  prismaMock,
  resetPrismaMock,
  createMockTransaction,
} from "../../../mocks/prisma";
import { createUser } from "../../../factories/user";

describe("blockUser", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
  });

  it("throws 400 when blocking yourself", async () => {
    await expect(blockUser("u1", "u1")).rejects.toMatchObject({
      statusCode: 400,
      code: "SELF_BLOCK",
    });
  });

  it("throws 404 when the target user does not exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(blockUser("u1", "u2")).rejects.toMatchObject({
      statusCode: 404,
      code: "USER_NOT_FOUND",
    });
  });

  it("creates the block, clears pending requests both ways, and returns the blocked user", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({ id: "u2", username: "bob" }) as any,
    );
    prismaMock.friendRequest.deleteMany.mockResolvedValue({ count: 1 } as any);
    prismaMock.userBlock.create.mockResolvedValue({
      createdAt: new Date("2026-01-01T00:00:00Z"),
    } as any);

    const result = await blockUser("u1", "u2");

    expect(prismaMock.friendRequest.deleteMany).toHaveBeenCalledWith({
      where: {
        status: "PENDING",
        OR: [
          { senderId: "u1", recipientId: "u2" },
          { senderId: "u2", recipientId: "u1" },
        ],
      },
    });
    expect(prismaMock.userBlock.create).toHaveBeenCalledWith({
      data: { blockerId: "u1", blockedId: "u2" },
      select: { createdAt: true },
    });
    expect(result.blockedUser.username).toBe("bob");
    expect(result.blockedUser.blockedAt).toBeInstanceOf(Date);
  });

  it("is idempotent when the user is already blocked", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({ id: "u2" }) as any,
    );
    prismaMock.friendRequest.deleteMany.mockResolvedValue({ count: 0 } as any);
    prismaMock.userBlock.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "1",
      }),
    );
    prismaMock.userBlock.findFirst.mockResolvedValue({
      createdAt: new Date("2026-01-02T00:00:00Z"),
    } as any);

    const result = await blockUser("u1", "u2");

    expect(result.blockedUser.id).toBe("u2");
    // Kept the existing row's timestamp rather than creating a new one.
    expect(result.blockedUser.blockedAt).toEqual(
      new Date("2026-01-02T00:00:00Z"),
    );
  });

  it("rethrows unexpected Prisma errors from the block create", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({ id: "u2" }) as any,
    );
    prismaMock.friendRequest.deleteMany.mockResolvedValue({ count: 0 } as any);
    const boom = new Error("DB outage");
    prismaMock.userBlock.create.mockRejectedValue(boom);

    await expect(blockUser("u1", "u2")).rejects.toBe(boom);
  });
});