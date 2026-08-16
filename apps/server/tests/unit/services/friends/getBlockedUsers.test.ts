import { describe, it, expect, vi, beforeEach } from "vitest";
import { getBlockedUsers } from "../../../../src/services/friends/getBlockedUsers";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";
import { createUser } from "../../../factories/user";

describe("getBlockedUsers", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("returns the blocker's list with blockedAt attached", async () => {
    prismaMock.userBlock.findMany.mockResolvedValue([
      {
        id: "b1",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        blocked: createUser({ id: "u2", username: "bob" }),
      },
    ] as any);

    const result = await getBlockedUsers("u1");

    expect(prismaMock.userBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { blockerId: "u1" },
        select: expect.any(Object),
      }),
    );
    expect(result.blockedUsers).toHaveLength(1);
    expect(result.blockedUsers[0]).toMatchObject({
      id: "u2",
      username: "bob",
      avatar: null,
      blockedAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(result.nextCursor).toBeNull();
  });

  it("returns an empty page with a null cursor when nothing is blocked", async () => {
    prismaMock.userBlock.findMany.mockResolvedValue([] as any);

    const result = await getBlockedUsers("u1");

    expect(result).toEqual({ blockedUsers: [], nextCursor: null });
  });

  it("paginates with a nextCursor when there are more rows", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: `b-${i}`,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      blocked: createUser({ id: `u-${i}` }),
    }));
    prismaMock.userBlock.findMany.mockResolvedValue(rows as any);

    const result = await getBlockedUsers("u1", { limit: 50 });

    expect(result.blockedUsers).toHaveLength(50);
    expect(result.nextCursor).toBe("b-49");
  });
});