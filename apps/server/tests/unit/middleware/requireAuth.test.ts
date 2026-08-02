import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import requireAuth from "../../../src/middleware/requireAuth";
import { prismaMock, resetPrismaMock } from "../../mocks/prisma";
import { createAuthUser } from "../../factories/user";
import { createMockRequest, createMockResponse, createMockNext } from "../../helpers/express";

describe("requireAuth", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return 401 when session has no userId", () => {
    const req = createMockRequest({ session: { userId: undefined } });
    const res = createMockResponse();
    const next = createMockNext();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should use cached user when cache is fresh", () => {
    const user = createAuthUser({ id: "u1" });
    const req = createMockRequest({
      session: {
        userId: "u1",
        userCache: {
          user,
          cachedAt: Date.now(),
        },
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    requireAuth(req, res, next);

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(req.user).toEqual(user);
    expect(next).toHaveBeenCalledOnce();
  });

  it("should fetch user from DB on cache miss", async () => {
    const user = createAuthUser({ id: "u1" });
    prismaMock.user.findUnique.mockResolvedValue(user as any);

    const req = createMockRequest({ session: { userId: "u1" } });
    const res = createMockResponse();
    const next = createMockNext();

    requireAuth(req, res, next);
    await new Promise((r) => setTimeout(r, 10));

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: expect.any(Object),
    });
    expect(req.user).toEqual(user);
    expect(next).toHaveBeenCalledOnce();
  });

  it("should destroy session and return 401 when user no longer exists", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const req = createMockRequest({ session: { userId: "u1" } });
    const res = createMockResponse();
    const next = createMockNext();

    requireAuth(req, res, next);
    await new Promise((r) => setTimeout(r, 10));

    expect(req.session.destroy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 500 on Prisma error", async () => {
    prismaMock.user.findUnique.mockRejectedValue(new Error("DB down"));

    const req = createMockRequest({ session: { userId: "u1" } });
    const res = createMockResponse();
    const next = createMockNext();

    requireAuth(req, res, next);
    await new Promise((r) => setTimeout(r, 10));

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "Internal server error" });
    expect(next).not.toHaveBeenCalled();
  });
});
