import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import requireAuth from "../../../src/middleware/requireAuth";
import { prismaMock, resetPrismaMock } from "../../mocks/prisma";
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from "../../helpers/express";

describe("requireAuth - stale session cleanup", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should still return 401 when destroying the stale session fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.user.findUnique.mockResolvedValue(null);

    const req = createMockRequest({
      session: {
        userId: "u1",
        destroy: vi.fn((cb) => cb?.(new Error("session store down"))),
      } as any,
    });
    const res = createMockResponse();
    const next = createMockNext();

    requireAuth(req, res, next);
    await new Promise((r) => setTimeout(r, 10));

    expect(errorSpy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should refetch the user when the cached snapshot belongs to another user", async () => {
    const dbUser = {
      id: "u1",
      email: "u1@example.com",
      username: "u1",
      displayName: "User One",
      avatar: null,
      bio: null,
      gender: null,
      dateOfBirth: null,
      createdAt: new Date("2024-01-01T00:00:00Z"),
    };
    prismaMock.user.findUnique.mockResolvedValue(dbUser as any);

    const req = createMockRequest({
      session: {
        userId: "u1",
        userCache: {
          user: { ...dbUser, id: "u2" },
          cachedAt: Date.now(),
        },
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    requireAuth(req, res, next);
    await new Promise((r) => setTimeout(r, 10));

    expect(prismaMock.user.findUnique).toHaveBeenCalledOnce();
    expect(req.user).toEqual(dbUser);
    expect(next).toHaveBeenCalledOnce();
  });
});
