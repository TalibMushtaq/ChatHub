import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRelationship } from "../../../../src/services/friends/getRelationship";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

describe("getRelationship", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("returns NONE for the user themselves", async () => {
    await expect(getRelationship("u1", "u1")).resolves.toBe("NONE");
    expect(prismaMock.userBlock.findFirst).not.toHaveBeenCalled();
  });

  it("returns BLOCKED with precedence over every other state", async () => {
    prismaMock.userBlock.findFirst.mockResolvedValue({ id: "b1" } as any);

    await expect(getRelationship("u1", "u2")).resolves.toBe("BLOCKED");
  });

  it("returns FRIENDS when a friendship exists", async () => {
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.friendship.findFirst.mockResolvedValue({ id: "f1" } as any);

    await expect(getRelationship("u1", "u2")).resolves.toBe("FRIENDS");
  });

  it("returns REQUEST_SENT when the actor sent a PENDING request", async () => {
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.friendship.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.findFirst.mockResolvedValue({ id: "r1" } as any);

    await expect(getRelationship("u1", "u2")).resolves.toBe("REQUEST_SENT");
  });

  it("returns REQUEST_RECEIVED when the target sent a PENDING request", async () => {
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.friendship.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.findFirst.mockResolvedValueOnce(null); // sent
    prismaMock.friendRequest.findFirst.mockResolvedValueOnce({ id: "r1" } as any); // received

    await expect(getRelationship("u1", "u2")).resolves.toBe(
      "REQUEST_RECEIVED",
    );
  });

  it("returns NONE when no relationship exists", async () => {
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.friendship.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.findFirst.mockResolvedValue(null);

    await expect(getRelationship("u1", "u2")).resolves.toBe("NONE");
  });
});