import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  assertRoomAccess,
  assertDirectChatAccess,
} from "../../../src/middleware/socketAccess";
import { prismaMock, resetPrismaMock } from "../../mocks/prisma";
import { createChatRoomMember, createDirectChat } from "../../factories/room";
import { ApiError } from "../../../src/lib/ApiError";

describe("assertRoomAccess", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should resolve when user is a member", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue(
      createChatRoomMember({ userId: "u1", chatRoomId: "r1" }) as any,
    );

    await expect(assertRoomAccess("u1", "r1")).resolves.toBeUndefined();
    expect(prismaMock.chatRoomMember.findUnique).toHaveBeenCalledWith({
      where: { userId_chatRoomId: { userId: "u1", chatRoomId: "r1" } },
      select: { id: true },
    });
  });

  it("should throw ApiError 403 when user is not a member", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue(null);

    await expect(assertRoomAccess("u1", "r1")).rejects.toThrow(ApiError);
    await expect(assertRoomAccess("u1", "r1")).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
      message: "Not authorized for this room",
    });
  });
});

describe("assertDirectChatAccess", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should resolve when user is user1", async () => {
    prismaMock.directChat.findUnique.mockResolvedValue(
      createDirectChat({ user1Id: "u1", user2Id: "u2" }) as any,
    );

    await expect(assertDirectChatAccess("u1", "dc1")).resolves.toBeUndefined();
  });

  it("should resolve when user is user2", async () => {
    prismaMock.directChat.findUnique.mockResolvedValue(
      createDirectChat({ user1Id: "u1", user2Id: "u2" }) as any,
    );

    await expect(assertDirectChatAccess("u2", "dc1")).resolves.toBeUndefined();
  });

  it("should throw ApiError 403 when chat does not exist", async () => {
    prismaMock.directChat.findUnique.mockResolvedValue(null);

    await expect(assertDirectChatAccess("u1", "dc1")).rejects.toThrow(ApiError);
    await expect(assertDirectChatAccess("u1", "dc1")).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });

  it("should throw ApiError 403 when user is not a participant", async () => {
    prismaMock.directChat.findUnique.mockResolvedValue(
      createDirectChat({ user1Id: "u1", user2Id: "u2" }) as any,
    );

    await expect(assertDirectChatAccess("u3", "dc1")).rejects.toThrow(ApiError);
    await expect(assertDirectChatAccess("u3", "dc1")).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
      message: "Not authorized for this chat",
    });
  });
});
