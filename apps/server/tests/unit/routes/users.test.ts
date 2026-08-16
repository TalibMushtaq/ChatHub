import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import usersRouter from "../../../src/routes/users";
import {
  prismaMock,
  resetPrismaMock,
  createMockTransaction,
} from "../../mocks/prisma";
import { createUser } from "../../factories/user";

const mocks = vi.hoisted(() => {
  const emit = vi.fn();
  const roomEmit: Record<string, { emit: typeof emit }> = {};
  return {
    io: {
      to: vi.fn((room: string) => (roomEmit[room] ??= { emit })),
    },
  };
});

vi.mock("../../../src/middleware/requireAuth", () => ({
  default: (req: any, _res: any, next: any) => {
    req.user = {
      id: "u1",
      username: "alice",
      displayName: null,
      avatar: null,
    };
    req.io = mocks.io;
    req.session = {};
    next();
  },
}));

// Push is a no-op in route tests (VAPID is not configured).
vi.mock("../../../src/lib/webPush", () => ({
  isWebPushConfigured: () => false,
}));

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/users", usersRouter);
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

describe("POST /users/:userId/block", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
  });

  it("blocks the user, clears pending requests, and emits to the blocked user", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({ id: "u2", username: "bob" }) as any,
    );
    prismaMock.friendRequest.deleteMany.mockResolvedValue({ count: 1 } as any);
    prismaMock.userBlock.create.mockResolvedValue({
      createdAt: new Date("2026-01-01T00:00:00Z"),
    } as any);

    const res = await supertest(createTestApp()).post("/users/u2/block");

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.blockedUser.id).toBe("u2");
    expect(res.body.blockedUser.blockedAt).toBeDefined();

    expect(prismaMock.friendRequest.deleteMany).toHaveBeenCalledWith({
      where: {
        status: "PENDING",
        OR: [
          { senderId: "u1", recipientId: "u2" },
          { senderId: "u2", recipientId: "u1" },
        ],
      },
    });
    // The blocked user hears about it (blocker = the session user).
    expect(mocks.io.to).toHaveBeenCalledWith("user:u2");
    expect(mocks.io.to("user:u2").emit).toHaveBeenCalledWith(
      "friend-request:blocked",
      expect.objectContaining({
        blockedBy: expect.objectContaining({ id: "u1", username: "alice" }),
      }),
    );
  });

  it("returns 400 when blocking yourself", async () => {
    const res = await supertest(createTestApp()).post("/users/u1/block");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("SELF_BLOCK");
    expect(mocks.io.to).not.toHaveBeenCalled();
  });

  it("returns 404 when the target user does not exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await supertest(createTestApp()).post("/users/u2/block");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("USER_NOT_FOUND");
  });
});

describe("DELETE /users/:userId/block", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("unblocks the user idempotently", async () => {
    prismaMock.userBlock.deleteMany.mockResolvedValue({ count: 1 } as any);

    const res = await supertest(createTestApp()).delete("/users/u2/block");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prismaMock.userBlock.deleteMany).toHaveBeenCalledWith({
      where: { blockerId: "u1", blockedId: "u2" },
    });
  });
});

describe("GET /users/blocked", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("returns the blocker's blocked list", async () => {
    prismaMock.userBlock.findMany.mockResolvedValue([
      {
        id: "b1",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        blocked: { id: "u2", username: "bob", displayName: null, avatar: null },
      },
    ] as any);

    const res = await supertest(createTestApp()).get("/users/blocked");

    expect(res.status).toBe(200);
    expect(res.body.blockedUsers).toHaveLength(1);
    expect(res.body.blockedUsers[0]).toMatchObject({
      id: "u2",
      username: "bob",
      blockedAt: "2026-01-01T00:00:00.000Z",
    });
    // "blocked" is a fixed route, not treated as a user id.
    expect(prismaMock.userBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { blockerId: "u1" } }),
    );
  });
});