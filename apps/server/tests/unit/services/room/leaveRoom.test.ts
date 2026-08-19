import { describe, it, expect, vi, beforeEach } from "vitest";
import { leaveRoom } from "../../../../src/services/room/leaveRoom";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

describe("leaveRoom service", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("removes the caller's membership and read receipt for non-owners", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue({
      role: "MEMBER",
    } as any);
    prismaMock.$transaction.mockImplementation((ops: any[]) =>
      Promise.all(ops),
    );

    await leaveRoom("u1", "r1");

    expect(prismaMock.chatRoomMember.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", chatRoomId: "r1" },
    });
    expect(prismaMock.chatRoomReadReceipt.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", chatRoomId: "r1" },
    });
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it("throws 403 for the room owner", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue({
      role: "OWNER",
    } as any);

    await expect(leaveRoom("u1", "r1")).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
    expect(prismaMock.chatRoomMember.deleteMany).not.toHaveBeenCalled();
  });

  it("throws 403 for a non-member", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue(null as any);

    await expect(leaveRoom("u1", "r1")).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });
});
