import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import updatePrivacyRouter from "../../../../src/routes/auth/updatePrivacy";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";
import { redis } from "../../../../src/lib/redis";

const reqToEmit = vi.fn();
const reqExceptEmit = vi.fn();
const reqIo = {
  to: vi.fn().mockReturnValue({ emit: reqToEmit }),
  except: vi.fn().mockReturnValue({ emit: reqExceptEmit }),
};

let mockSession: { userCache: { cachedAt: number } };

vi.mock("../../../../src/middleware/requireAuth", () => ({
  default: (req: any, _res: any, next: any) => {
    req.user = { id: "u1" };
    req.io = reqIo;
    mockSession = { userCache: { cachedAt: 999 } };
    req.session = mockSession;
    next();
  },
}));

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/auth", updatePrivacyRouter);
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    void _next;
    const status = err.statusCode || err.status || 500;
    res.status(status).json({
      ok: false,
      error: err.message || "Server error",
      ...(err.code && { code: err.code }),
    });
  });
  return app;
}

function mockBlob() {
  return JSON.stringify({
    presence: "online",
    status: "AVAILABLE",
    customStatus: null,
    lastActiveAt: 1_700_000_000_000,
    showOnlineStatus: true,
    showTypingStatus: true,
  }) as never;
}

describe("PATCH /auth/me/privacy", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    vi.mocked(redis.get).mockResolvedValue(mockBlob());
  });

  it("turns off online-status sharing and clears cached presence for others", async () => {
    prismaMock.user.update.mockResolvedValue({
      id: "u1",
      showOnlineStatus: false,
      showTypingStatus: true,
    } as any);

    const res = await supertest(createTestApp())
      .patch("/auth/me/privacy")
      .send({ showOnlineStatus: false });

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      id: "u1",
      showOnlineStatus: false,
      showTypingStatus: true,
    });

    const call = prismaMock.user.update.mock.calls[0]![0] as any;
    expect(call.where).toEqual({ id: "u1" });
    expect(call.data).toEqual({ showOnlineStatus: false });
    expect(call.select).toEqual({
      id: true,
      showOnlineStatus: true,
      showTypingStatus: true,
    });

    // Privacy flags synced into the presence blob.
    const [, raw, opts] = vi.mocked(redis.set).mock.calls[0]!;
    expect(opts).toEqual({ EX: 600 });
    const blob = JSON.parse(raw as string);
    expect(blob.showOnlineStatus).toBe(false);

    // One-time "offline" pushed to everyone except the user's own room.
    expect(reqIo.except).toHaveBeenCalledWith("user:u1");
    expect(reqExceptEmit).toHaveBeenCalledWith("presence:changed", {
      userId: "u1",
      presence: "offline",
      status: null,
      customStatus: null,
    });
    // The own-room broadcast is skipped on the hidden branch.
    expect(reqIo.to).not.toHaveBeenCalled();
  });

  it("broadcasts the changed presence when online sharing is turned on", async () => {
    prismaMock.user.update.mockResolvedValue({
      id: "u1",
      showOnlineStatus: true,
      showTypingStatus: false,
    } as any);

    await supertest(createTestApp())
      .patch("/auth/me/privacy")
      .send({ showOnlineStatus: true });

    // Visible again -> broadcastPresenceChanged emits real presence to the
    // own room and (via except) a gated copy to others.
    expect(reqIo.to).toHaveBeenCalledWith("user:u1");
    expect(reqToEmit).toHaveBeenCalledWith("presence:changed", {
      userId: "u1",
      presence: "online",
      status: "AVAILABLE",
      customStatus: null,
    });
    expect(reqIo.except).toHaveBeenCalledWith("user:u1");
    expect(reqExceptEmit).toHaveBeenCalledWith("presence:changed", {
      userId: "u1",
      presence: "online",
      status: "AVAILABLE",
      customStatus: null,
    });
  });

  it("updates typing visibility without touching online visibility", async () => {
    prismaMock.user.update.mockResolvedValue({
      id: "u1",
      showOnlineStatus: true,
      showTypingStatus: false,
    } as any);

    const res = await supertest(createTestApp())
      .patch("/auth/me/privacy")
      .send({ showTypingStatus: false });

    expect(res.status).toBe(200);
    const call = prismaMock.user.update.mock.calls[0]![0] as any;
    expect(call.data).toEqual({ showTypingStatus: false });
    const [, raw] = vi.mocked(redis.set).mock.calls[0]!;
    expect(JSON.parse(raw as string).showTypingStatus).toBe(false);
    expect(mockSession.userCache.cachedAt).toBe(0);
  });

  it("rejects invalid values", async () => {
    const res = await supertest(createTestApp())
      .patch("/auth/me/privacy")
      .send({ showOnlineStatus: "yes" });

    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rejects unknown fields via strict validation", async () => {
    const res = await supertest(createTestApp())
      .patch("/auth/me/privacy")
      .send({ showTypingStatus: false, extra: 1 });

    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rejects an empty update", async () => {
    const res = await supertest(createTestApp()).patch("/auth/me/privacy").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Nothing to update");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
