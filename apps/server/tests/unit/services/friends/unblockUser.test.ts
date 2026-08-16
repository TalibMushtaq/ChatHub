import { describe, it, expect, vi, beforeEach } from "vitest";
import { unblockUser } from "../../../../src/services/friends/unblockUser";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

describe("unblockUser", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("deletes the block scoped to the blocker", async () => {
    prismaMock.userBlock.deleteMany.mockResolvedValue({ count: 1 } as any);

    const result = await unblockUser("u1", "u2");

    expect(prismaMock.userBlock.deleteMany).toHaveBeenCalledWith({
      where: { blockerId: "u1", blockedId: "u2" },
    });
    expect(result).toEqual({ blockedId: "u2" });
  });

  it("is idempotent for a non-existent block", async () => {
    prismaMock.userBlock.deleteMany.mockResolvedValue({ count: 0 } as any);

    await expect(unblockUser("u1", "u2")).resolves.toEqual({
      blockedId: "u2",
    });
  });
});
