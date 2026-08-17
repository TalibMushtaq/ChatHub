import { describe, it, expect, vi, beforeEach } from "vitest";
import { withdrawFriendRequest } from "../../../../src/services/friends/withdrawFriendRequest";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

describe("withdrawFriendRequest", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("throws 404 when the request is missing, not pending, or not sent by the caller", async () => {
    prismaMock.friendRequest.findFirst.mockResolvedValue(null);

    await expect(withdrawFriendRequest("u1", "fr1")).rejects.toMatchObject({
      statusCode: 404,
      code: "REQUEST_NOT_FOUND",
    });
  });

  it("deletes the sender's own PENDING request and returns the recipient id", async () => {
    prismaMock.friendRequest.findFirst.mockResolvedValue({
      id: "fr1",
      recipientId: "u2",
    } as any);
    prismaMock.friendRequest.deleteMany.mockResolvedValue({ count: 1 } as any);

    const result = await withdrawFriendRequest("u1", "fr1");

    // Scoped to senderId so someone else's request id can never be withdrawn.
    expect(prismaMock.friendRequest.deleteMany).toHaveBeenCalledWith({
      where: { id: "fr1", senderId: "u1", status: "PENDING" },
    });
    expect(result).toEqual({ requestId: "fr1", recipientId: "u2" });
  });

  it("throws 409 when a concurrent accept won the race (deleteMany matched 0 rows)", async () => {
    prismaMock.friendRequest.findFirst.mockResolvedValue({
      id: "fr1",
      recipientId: "u2",
    } as any);
    prismaMock.friendRequest.deleteMany.mockResolvedValue({ count: 0 } as any);

    await expect(withdrawFriendRequest("u1", "fr1")).rejects.toMatchObject({
      statusCode: 409,
      code: "REQUEST_ALREADY_HANDLED",
    });
  });
});
