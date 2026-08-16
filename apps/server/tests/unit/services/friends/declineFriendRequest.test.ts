import { describe, it, expect, vi, beforeEach } from "vitest";
import { declineFriendRequest } from "../../../../src/services/friends/declineFriendRequest";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

describe("declineFriendRequest", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("throws 404 when the request is missing, not pending, or not addressed to the caller", async () => {
    prismaMock.friendRequest.findFirst.mockResolvedValue(null);

    await expect(declineFriendRequest("u2", "fr1")).rejects.toMatchObject({
      statusCode: 404,
      code: "REQUEST_NOT_FOUND",
    });
  });

  it("declines a PENDING request and returns the sender id for the socket event", async () => {
    prismaMock.friendRequest.findFirst.mockResolvedValue({
      id: "fr1",
      senderId: "u1",
    } as any);
    prismaMock.friendRequest.updateMany.mockResolvedValue({ count: 1 } as any);

    const result = await declineFriendRequest("u2", "fr1");

    expect(prismaMock.friendRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "fr1", recipientId: "u2", status: "PENDING" },
      data: { status: "DECLINED" },
    });
    expect(result).toEqual({ requestId: "fr1", senderId: "u1" });
  });

  it("throws 409 when a concurrent accept won the race (updateMany matched 0 rows)", async () => {
    prismaMock.friendRequest.findFirst.mockResolvedValue({
      id: "fr1",
      senderId: "u1",
    } as any);
    prismaMock.friendRequest.updateMany.mockResolvedValue({ count: 0 } as any);

    await expect(declineFriendRequest("u2", "fr1")).rejects.toMatchObject({
      statusCode: 409,
      code: "REQUEST_ALREADY_HANDLED",
    });
  });
});