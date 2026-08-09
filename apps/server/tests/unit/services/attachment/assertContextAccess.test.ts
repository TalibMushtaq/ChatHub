import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertUploadContextAccess } from "../../../../src/services/attachment/assertContextAccess";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";
import { ApiError } from "../../../../src/lib/ApiError";

describe("assertUploadContextAccess", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("allows a room member to upload into that room", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue({
      id: "m-1",
    } as any);

    await expect(
      assertUploadContextAccess("user-1", "room", "room-1"),
    ).resolves.toBeUndefined();
  });

  it("rejects a non-member uploading into a room", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue(null as any);

    await expect(
      assertUploadContextAccess("user-1", "room", "room-1"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("allows a direct chat participant to upload into that chat", async () => {
    prismaMock.directChat.findUnique.mockResolvedValue({
      user1Id: "user-1",
      user2Id: "user-2",
    } as any);

    await expect(
      assertUploadContextAccess("user-1", "dm", "dc-1"),
    ).resolves.toBeUndefined();
  });

  it("rejects a non-participant uploading into a direct chat", async () => {
    prismaMock.directChat.findUnique.mockResolvedValue({
      user1Id: "user-2",
      user2Id: "user-3",
    } as any);

    await expect(
      assertUploadContextAccess("user-1", "dm", "dc-1"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("allows a voice upload when the context id is an accessible room", async () => {
    prismaMock.directChat.findUnique.mockResolvedValue(null as any);
    prismaMock.chatRoomMember.findUnique.mockResolvedValue({
      id: "m-1",
    } as any);

    await expect(
      assertUploadContextAccess("user-1", "voice", "room-1"),
    ).resolves.toBeUndefined();
  });

  it("rejects a voice upload when neither a direct chat nor a room grants access", async () => {
    prismaMock.directChat.findUnique.mockResolvedValue(null as any);
    prismaMock.chatRoomMember.findUnique.mockResolvedValue(null as any);

    const error = await assertUploadContextAccess(
      "user-1",
      "voice",
      "ctx-1",
    ).catch((err) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBe(403);
  });
});
