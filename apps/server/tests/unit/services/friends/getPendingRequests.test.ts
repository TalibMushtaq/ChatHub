import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPendingRequests } from "../../../../src/services/friends/getPendingRequests";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";
import { createUser } from "../../../factories/user";

describe("getPendingRequests", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("returns an empty page with a null cursor when nothing is pending", async () => {
    prismaMock.friendRequest.findMany.mockResolvedValue([] as any);

    const result = await getPendingRequests("u2");

    expect(result).toEqual({ requests: [], nextCursor: null });
    expect(prismaMock.friendRequest.findMany).toHaveBeenCalledWith({
      where: { recipientId: "u2", status: "PENDING" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51, // DEFAULT_PAGE_SIZE + 1
      select: expect.any(Object),
    });
  });

  it("paginates with a nextCursor when there are more rows", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: `fr-${i}`,
      senderId: "u1",
      recipientId: "u2",
      status: "PENDING",
      sender: createUser({ id: "u1" }),
      recipient: createUser({ id: "u2" }),
    }));
    prismaMock.friendRequest.findMany.mockResolvedValue(rows as any);

    const result = await getPendingRequests("u2", { limit: 50 });

    expect(result.requests).toHaveLength(50);
    expect(result.nextCursor).toBe("fr-49");
  });

  it("applies the cursor and skips the cursor row", async () => {
    prismaMock.friendRequest.findMany.mockResolvedValue([] as any);

    await getPendingRequests("u2", { cursor: "fr-10", limit: 20 });

    expect(prismaMock.friendRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: "fr-10" },
        skip: 1,
        take: 21,
      }),
    );
  });
});
