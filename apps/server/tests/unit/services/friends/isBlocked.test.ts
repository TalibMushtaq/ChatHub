import { describe, it, expect, vi, beforeEach } from "vitest";
import { isBlocked } from "../../../../src/services/friends/isBlocked";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

describe("isBlocked", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("returns false for a self-check without querying", async () => {
    await expect(isBlocked("u1", "u1")).resolves.toBe(false);
    expect(prismaMock.userBlock.findFirst).not.toHaveBeenCalled();
  });

  it("returns true when the actor blocked the target", async () => {
    prismaMock.userBlock.findFirst.mockResolvedValue({ id: "b1" } as any);

    await expect(isBlocked("u1", "u2")).resolves.toBe(true);
    expect(prismaMock.userBlock.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { blockerId: "u1", blockedId: "u2" },
          { blockerId: "u2", blockedId: "u1" },
        ],
      },
      select: { id: true },
    });
  });

  it("returns true when the target blocked the actor (either direction)", async () => {
    prismaMock.userBlock.findFirst.mockResolvedValue({ id: "b1" } as any);

    await expect(isBlocked("u1", "u2")).resolves.toBe(true);
  });

  it("returns false when no block exists in either direction", async () => {
    prismaMock.userBlock.findFirst.mockResolvedValue(null);

    await expect(isBlocked("u1", "u2")).resolves.toBe(false);
  });
});