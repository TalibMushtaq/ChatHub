import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import friendsRouter from "../../../src/routes/friends";
import {
  prismaMock,
  resetPrismaMock,
  createMockTransaction,
} from "../../mocks/prisma";
import { createUser } from "../../factories/user";

// Shared io mock: the requireAuth stub attaches THIS object to req.io so route
// tests can assert the socket emits. `to()` returns a stable emit spy per room.
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
    req.user = { id: "u1", username: "alice", displayName: null, avatar: null };
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
  app.use("/friends", friendsRouter);
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

function requestPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "fr1",
    senderId: "u1",
    recipientId: "u2",
    status: "PENDING",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    sender: { id: "u1", username: "alice", displayName: null, avatar: null },
    recipient: { id: "u2", username: "bob", displayName: null, avatar: null },
    ...overrides,
  };
}

describe("POST /friends/requests", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
  });

  it("creates a request, emits to the recipient, and returns it", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({ id: "u2" }) as any,
    );
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.friendship.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.create.mockResolvedValue(requestPayload() as any);

    const res = await supertest(createTestApp())
      .post("/friends/requests")
      .send({ userId: "u2" });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.request.id).toBe("fr1");

    // The sender id always comes from the session, never the body.
    expect(prismaMock.friendRequest.create).toHaveBeenCalledWith({
      data: {
        senderId: "u1",
        recipientId: "u2",
        pairKey: "u1|u2",
        status: "PENDING",
      },
      select: expect.any(Object),
    });
    expect(mocks.io.to).toHaveBeenCalledWith("user:u2");
    expect(mocks.io.to("user:u2").emit).toHaveBeenCalledWith(
      "friend-request:new",
      expect.objectContaining({ id: "fr1" }),
    );
  });

  it("rejects a missing target userId", async () => {
    const res = await supertest(createTestApp())
      .post("/friends/requests")
      .send({});

    expect(res.status).toBe(400);
    expect(prismaMock.friendRequest.create).not.toHaveBeenCalled();
  });

  it("surfaces 409 when the pair is already friends", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({ id: "u2" }) as any,
    );
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.friendship.findFirst.mockResolvedValue({ id: "f1" } as any);

    const res = await supertest(createTestApp())
      .post("/friends/requests")
      .send({ userId: "u2" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ALREADY_FRIENDS");
    expect(mocks.io.to).not.toHaveBeenCalled();
  });

  it("surfaces 403 when a block exists between the pair", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({ id: "u2" }) as any,
    );
    prismaMock.userBlock.findFirst.mockResolvedValue({ id: "b1" } as any);

    const res = await supertest(createTestApp())
      .post("/friends/requests")
      .send({ userId: "u2" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("BLOCKED");
  });
});

describe("GET /friends/requests", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("returns the recipient's pending requests", async () => {
    prismaMock.friendRequest.findMany.mockResolvedValue([
      requestPayload() as any,
    ]);

    const res = await supertest(createTestApp()).get("/friends/requests");

    expect(res.status).toBe(200);
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.nextCursor).toBeNull();
    expect(prismaMock.friendRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientId: "u1", status: "PENDING" },
      }),
    );
  });
});

describe("POST /friends/requests/:requestId/accept", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
  });

  it("accepts and emits to the original sender", async () => {
    prismaMock.friendRequest.findFirst.mockResolvedValue({
      id: "fr1",
      senderId: "u2",
      recipientId: "u1",
    } as any);
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.friendRequest.update.mockResolvedValue(
      requestPayload({
        id: "fr1",
        senderId: "u2",
        recipientId: "u1",
        status: "ACCEPTED",
        sender: { id: "u2", username: "bob", displayName: null, avatar: null },
        recipient: {
          id: "u1",
          username: "alice",
          displayName: null,
          avatar: null,
        },
      }) as any,
    );
    prismaMock.friendship.create.mockResolvedValue({ id: "f1" } as any);

    const res = await supertest(createTestApp()).post(
      "/friends/requests/fr1/accept",
    );

    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe("ACCEPTED");
    // The original sender (u2) hears that the recipient (u1) accepted.
    expect(mocks.io.to).toHaveBeenCalledWith("user:u2");
    expect(mocks.io.to("user:u2").emit).toHaveBeenCalledWith(
      "friend-request:accepted",
      expect.objectContaining({
        requestId: "fr1",
        friend: expect.objectContaining({ id: "u1" }),
      }),
    );
  });

  it("returns 404 when the request is not addressable by the recipient", async () => {
    prismaMock.friendRequest.findFirst.mockResolvedValue(null);

    const res = await supertest(createTestApp()).post(
      "/friends/requests/fr1/accept",
    );

    expect(res.status).toBe(404);
    expect(mocks.io.to).not.toHaveBeenCalled();
  });
});

describe("POST /friends/requests/:requestId/decline", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("declines and emits to the original sender", async () => {
    prismaMock.friendRequest.findFirst.mockResolvedValue({
      id: "fr1",
      senderId: "u2",
    } as any);
    prismaMock.friendRequest.updateMany.mockResolvedValue({ count: 1 } as any);

    const res = await supertest(createTestApp()).post(
      "/friends/requests/fr1/decline",
    );

    expect(res.status).toBe(200);
    expect(res.body.requestId).toBe("fr1");
    expect(mocks.io.to).toHaveBeenCalledWith("user:u2");
    expect(mocks.io.to("user:u2").emit).toHaveBeenCalledWith(
      "friend-request:declined",
      expect.objectContaining({ requestId: "fr1", userId: "u1" }),
    );
  });
});
