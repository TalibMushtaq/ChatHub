import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRelationships } from "../../../../src/services/friends/getRelationships";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

describe("getRelationships", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("returns an empty map for an empty id list without querying", async () => {
    const map = await getRelationships("u1", []);

    expect(map.size).toBe(0);
    expect(prismaMock.userBlock.findMany).not.toHaveBeenCalled();
  });

  it("merges all four states with block taking precedence", async () => {
    prismaMock.userBlock.findMany.mockResolvedValue([
      { blockerId: "u1", blockedId: "u2" },
    ] as any);
    prismaMock.friendship.findMany.mockResolvedValue([
      { userAId: "u1", userBId: "u3" },
    ] as any);
    prismaMock.friendRequest.findMany.mockResolvedValueOnce([
      { recipientId: "u4" },
    ] as any); // sent by actor
    prismaMock.friendRequest.findMany.mockResolvedValueOnce([
      { senderId: "u5" },
    ] as any); // received by actor

    const map = await getRelationships("u1", ["u2", "u3", "u4", "u5"]);

    expect(map.get("u2")).toBe("BLOCKED");
    expect(map.get("u3")).toBe("FRIENDS");
    expect(map.get("u4")).toBe("REQUEST_SENT");
    expect(map.get("u5")).toBe("REQUEST_RECEIVED");
  });

  it("defaults every requested id to NONE", async () => {
    prismaMock.userBlock.findMany.mockResolvedValue([] as any);
    prismaMock.friendship.findMany.mockResolvedValue([] as any);
    prismaMock.friendRequest.findMany.mockResolvedValue([] as any);

    const map = await getRelationships("u1", ["u2", "u3"]);

    expect(map.get("u2")).toBe("NONE");
    expect(map.get("u3")).toBe("NONE");
  });

  it("deduplicates repeated ids", async () => {
    prismaMock.userBlock.findMany.mockResolvedValue([] as any);
    prismaMock.friendship.findMany.mockResolvedValue([] as any);
    prismaMock.friendRequest.findMany.mockResolvedValue([] as any);

    const map = await getRelationships("u1", ["u2", "u2", "u3"]);

    // The input had a duplicate, so only two unique entries are produced.
    expect(map.size).toBe(2);
    expect(map.get("u2")).toBe("NONE");
    expect(map.get("u3")).toBe("NONE");
  });
});