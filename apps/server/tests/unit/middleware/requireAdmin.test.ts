import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireAdmin } from "../../../src/middleware/requireAdmin";
import { prismaMock, resetPrismaMock } from "../../mocks/prisma";
import { createAuthUser } from "../../factories/user";
import { createChatRoomMember } from "../../factories/room";
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from "../../helpers/express";

describe("requireAdmin", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should call next when user is OWNER", async () => {
    const membership = createChatRoomMember({ role: "OWNER" });
    prismaMock.chatRoomMember.findUnique.mockResolvedValue(membership as any);

    const req = createMockRequest({
      user: createAuthUser(),
      params: { roomId: "r1" },
    });
    const res = createMockResponse();
    const next = createMockNext();

    requireAdmin(req, res, next);
    await new Promise((r) => setTimeout(r, 10));

    expect(prismaMock.chatRoomMember.findUnique).toHaveBeenCalledWith({
      where: { userId_chatRoomId: { userId: req.user!.id, chatRoomId: "r1" } },
      select: { role: true },
    });
    expect(next).toHaveBeenCalledOnce();
    expect((req as any).membership).toEqual(membership);
  });

  it("should call next when user is ADMIN", async () => {
    const membership = createChatRoomMember({ role: "ADMIN" });
    prismaMock.chatRoomMember.findUnique.mockResolvedValue(membership as any);

    const req = createMockRequest({
      user: createAuthUser(),
      params: { roomId: "r1" },
    });
    const res = createMockResponse();
    const next = createMockNext();

    requireAdmin(req, res, next);
    await new Promise((r) => setTimeout(r, 10));

    expect(next).toHaveBeenCalledOnce();
  });

  it("should return 403 when user is MEMBER", async () => {
    const membership = createChatRoomMember({ role: "MEMBER" });
    prismaMock.chatRoomMember.findUnique.mockResolvedValue(membership as any);

    const req = createMockRequest({
      user: createAuthUser(),
      params: { roomId: "r1" },
    });
    const res = createMockResponse();
    const next = createMockNext();

    requireAdmin(req, res, next);
    await new Promise((r) => setTimeout(r, 10));

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "Not authorized",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 403 when user has no membership", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue(null);

    const req = createMockRequest({
      user: createAuthUser(),
      params: { roomId: "r1" },
    });
    const res = createMockResponse();
    const next = createMockNext();

    requireAdmin(req, res, next);
    await new Promise((r) => setTimeout(r, 10));

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "Not authorized",
    });
  });

  it("should forward unexpected errors to next", async () => {
    prismaMock.chatRoomMember.findUnique.mockRejectedValue(
      new Error("DB down"),
    );

    const req = createMockRequest({
      user: createAuthUser(),
      params: { roomId: "r1" },
    });
    const res = createMockResponse();
    const next = createMockNext();

    requireAdmin(req, res, next);
    await new Promise((r) => setTimeout(r, 10));

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
