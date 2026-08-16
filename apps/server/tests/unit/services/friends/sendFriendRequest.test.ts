import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { sendFriendRequest } from "../../../../src/services/friends/sendFriendRequest";
import {
  prismaMock,
  resetPrismaMock,
  createMockTransaction,
} from "../../../mocks/prisma";
import { createUser } from "../../../factories/user";

function pendingRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "fr1",
    senderId: "u1",
    recipientId: "u2",
    pairKey: "u1|u2",
    status: "PENDING",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    sender: createUser({ id: "u1" }),
    recipient: createUser({ id: "u2" }),
    ...overrides,
  };
}

describe("sendFriendRequest", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
  });

  it("throws 400 when sending a request to yourself", async () => {
    await expect(sendFriendRequest("u1", "u1")).rejects.toMatchObject({
      statusCode: 400,
      code: "SELF_FRIEND_REQUEST",
    });
  });

  it("throws 404 when the recipient does not exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(sendFriendRequest("u1", "u2")).rejects.toMatchObject({
      statusCode: 404,
      code: "USER_NOT_FOUND",
    });
  });

  it("throws 403 when either side has blocked the other", async () => {
    prismaMock.user.findUnique.mockResolvedValue(createUser({ id: "u2" }) as any);
    // u2 blocked u1 → request is refused in both directions.
    prismaMock.userBlock.findFirst.mockResolvedValue({ id: "b1" } as any);

    await expect(sendFriendRequest("u1", "u2")).rejects.toMatchObject({
      statusCode: 403,
      code: "BLOCKED",
    });
  });

  it("throws 409 when the pair is already friends", async () => {
    prismaMock.user.findUnique.mockResolvedValue(createUser({ id: "u2" }) as any);
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.friendship.findFirst.mockResolvedValue({ id: "f1" } as any);

    await expect(sendFriendRequest("u1", "u2")).rejects.toMatchObject({
      statusCode: 409,
      code: "ALREADY_FRIENDS",
    });
  });

  it("throws 409 when a PENDING request already exists", async () => {
    prismaMock.user.findUnique.mockResolvedValue(createUser({ id: "u2" }) as any);
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.friendship.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.findFirst.mockResolvedValue({
      id: "fr0",
    } as any);

    await expect(sendFriendRequest("u1", "u2")).rejects.toMatchObject({
      statusCode: 409,
      code: "REQUEST_ALREADY_SENT",
    });
  });

  it("creates a PENDING request with a normalized pairKey", async () => {
    prismaMock.user.findUnique.mockResolvedValue(createUser({ id: "u2" }) as any);
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.friendship.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.create.mockResolvedValue(
      pendingRequest() as any,
    );

    const result = await sendFriendRequest("u1", "u2");

    expect(prismaMock.friendRequest.create).toHaveBeenCalledWith({
      data: { senderId: "u1", recipientId: "u2", pairKey: "u1|u2", status: "PENDING" },
      select: expect.any(Object),
    });
    expect(result.status).toBe("PENDING");
  });

  it("normalizes the pairKey regardless of sender/recipient order", async () => {
    prismaMock.user.findUnique.mockResolvedValue(createUser({ id: "u1" }) as any);
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.friendship.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.create.mockResolvedValue(pendingRequest() as any);

    await sendFriendRequest("u2", "u1");

    expect(prismaMock.friendRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pairKey: "u1|u2" }),
      }),
    );
  });

  it("maps the mutual-request race (P2002) to a 409", async () => {
    prismaMock.user.findUnique.mockResolvedValue(createUser({ id: "u2" }) as any);
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.friendship.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "1",
      }),
    );

    await expect(sendFriendRequest("u1", "u2")).rejects.toMatchObject({
      statusCode: 409,
      code: "REQUEST_ALREADY_SENT",
    });
  });

  it("rethrows unexpected Prisma errors", async () => {
    prismaMock.user.findUnique.mockResolvedValue(createUser({ id: "u2" }) as any);
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.friendship.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.findFirst.mockResolvedValue(null);
    const boom = new Error("DB outage");
    prismaMock.friendRequest.create.mockRejectedValue(boom);

    await expect(sendFriendRequest("u1", "u2")).rejects.toBe(boom);
  });
});