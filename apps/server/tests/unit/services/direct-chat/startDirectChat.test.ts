import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { startDirectChat } from "../../../../src/services/direct-chat/startDirectChat";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";
import { createDirectChat } from "../../../factories/room";
import { createUser } from "../../../factories/user";
import { ApiError } from "../../../../src/lib/ApiError";

describe("startDirectChat", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should throw 400 when user tries to DM themselves", async () => {
    await expect(startDirectChat("u1", "u1")).rejects.toThrow(ApiError);
    await expect(startDirectChat("u1", "u1")).rejects.toMatchObject({
      statusCode: 400,
      code: "SELF_DM",
    });
  });

  it("should throw 404 when target user does not exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(startDirectChat("u1", "u2")).rejects.toThrow(ApiError);
    await expect(startDirectChat("u1", "u2")).rejects.toMatchObject({
      statusCode: 404,
      code: "USER_NOT_FOUND",
    });
  });

  it("should create a new chat and return created=true", async () => {
    const user = createUser({ id: "u2" });
    const chat = createDirectChat({ user1Id: "u1", user2Id: "u2" });
    prismaMock.user.findUnique.mockResolvedValue(user as any);
    prismaMock.directChat.create.mockResolvedValue(chat as any);

    const result = await startDirectChat("u1", "u2");

    expect(result.created).toBe(true);
    expect(result.chat).toEqual(chat);
    expect(prismaMock.directChat.create).toHaveBeenCalledWith({
      data: { user1Id: "u1", user2Id: "u2" },
      select: expect.any(Object),
    });
  });

  it("should normalize user1Id < user2Id ordering", async () => {
    const user = createUser({ id: "u1" });
    prismaMock.user.findUnique.mockResolvedValue(user as any);
    prismaMock.directChat.create.mockResolvedValue({} as any);

    await startDirectChat("u2", "u1");

    expect(prismaMock.directChat.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { user1Id: "u1", user2Id: "u2" },
      }),
    );
  });

  it("should return existing chat on P2002 race condition", async () => {
    const user = createUser({ id: "u2" });
    const existing = createDirectChat({ user1Id: "u1", user2Id: "u2" });
    prismaMock.user.findUnique.mockResolvedValue(user as any);
    prismaMock.directChat.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "1",
      }),
    );
    prismaMock.directChat.findUnique.mockResolvedValue(existing as any);

    const result = await startDirectChat("u1", "u2");

    expect(result.created).toBe(false);
    expect(result.chat).toEqual(existing);
  });

  it("should throw 404 when existing chat is not found after race", async () => {
    const user = createUser({ id: "u2" });
    prismaMock.user.findUnique.mockResolvedValue(user as any);
    prismaMock.directChat.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "1",
      }),
    );
    prismaMock.directChat.findUnique.mockResolvedValue(null);

    await expect(startDirectChat("u1", "u2")).rejects.toThrow(ApiError);
    await expect(startDirectChat("u1", "u2")).rejects.toMatchObject({
      statusCode: 404,
      code: "CHAT_NOT_FOUND",
    });
  });

  it("should rethrow unexpected Prisma errors", async () => {
    const user = createUser({ id: "u2" });
    const unknownErr = new Error("DB outage");
    prismaMock.user.findUnique.mockResolvedValue(user as any);
    prismaMock.directChat.create.mockRejectedValue(unknownErr);

    await expect(startDirectChat("u1", "u2")).rejects.toBe(unknownErr);
  });
});
