import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import dmChatsRouter from "../../../src/routes/direct-chat/chats";
import roomRouter from "../../../src/routes/room/room";
import { ApiError } from "../../../src/lib/ApiError";
import { assertRoomAccess } from "../../../src/middleware/socketAccess";
import { prismaMock, resetPrismaMock } from "../../mocks/prisma";

// Shared mock setup for both DM and room route tests
vi.mock("../../../src/middleware/requireAuth", () => ({
  default: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1" };
    req.io = { to: vi.fn(() => ({ emit: vi.fn() })) };
    next();
  },
}));

vi.mock("../../../src/lib/rateLimiter", () => ({
  createRateLimiter: vi
    .fn()
    .mockReturnValue(
      vi.fn().mockResolvedValue({ allowed: true, remaining: 100 }),
    ),
  setRateLimitHeaders: vi.fn(),
  enforceRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/middleware/socketAccess", () => ({
  assertDirectChatAccess: vi.fn().mockResolvedValue(undefined),
  assertRoomAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/services/direct-chat/markRead", () => ({
  markDirectChatRead: vi.fn().mockResolvedValue({
    lastReadMessageId: "msg-1",
    unreadCount: 0,
  }),
}));

vi.mock("../../../src/services/room/markRead", () => ({
  markRoomRead: vi.fn().mockResolvedValue({
    lastReadMessageId: "msg-1",
    unreadCount: 0,
  }),
}));

function createDmTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/", dmChatsRouter);
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.statusCode || err.status || 500;
    res.status(status).json({
      ok: false,
      error: err.message || "Server error",
      ...(err.code && { code: err.code }),
    });
  });
  return app;
}

function createRoomTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/", roomRouter);
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.statusCode || err.status || 500;
    res.status(status).json({
      ok: false,
      error: err.message || "Server error",
      ...(err.code && { code: err.code }),
    });
  });
  return app;
}

// ---------------------------------------------------------------------------
// DM mark-read route tests
// ---------------------------------------------------------------------------

describe("POST /:directChatId/mark-read", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should mark a DM as read and return ok with unreadCount", async () => {
    const app = createDmTestApp();

    const res = await supertest(app)
      .post("/dc1/mark-read")
      .send({ lastReadMessageId: "msg-1" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.lastReadMessageId).toBe("msg-1");
    expect(res.body.unreadCount).toBe(0);
  });

  it("should return 400 when lastReadMessageId is missing", async () => {
    const app = createDmTestApp();

    const res = await supertest(app).post("/dc1/mark-read").send({});

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("should return 400 when lastReadMessageId is empty string", async () => {
    const app = createDmTestApp();

    const res = await supertest(app)
      .post("/dc1/mark-read")
      .send({ lastReadMessageId: "" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("should return 404 when directChatId param is missing", async () => {
    const app = createDmTestApp();

    const res = await supertest(app)
      .post("/mark-read")
      .send({ lastReadMessageId: "msg-1" });

    expect(res.status).toBe(404);
  });

  it("should call markDirectChatRead with correct arguments", async () => {
    const { markDirectChatRead } =
      await import("../../../src/services/direct-chat/markRead");
    vi.mocked(markDirectChatRead).mockResolvedValue({
      lastReadMessageId: "msg-2",
      unreadCount: 2,
    });

    const app = createDmTestApp();

    await supertest(app)
      .post("/dc1/mark-read")
      .send({ lastReadMessageId: "msg-2" });

    expect(markDirectChatRead).toHaveBeenCalledWith("user-1", "dc1", "msg-2");
  });

  it("should return the unreadCount from the service", async () => {
    const { markDirectChatRead } =
      await import("../../../src/services/direct-chat/markRead");
    vi.mocked(markDirectChatRead).mockResolvedValue({
      lastReadMessageId: "msg-3",
      unreadCount: 5,
    });

    const app = createDmTestApp();

    const res = await supertest(app)
      .post("/dc1/mark-read")
      .send({ lastReadMessageId: "msg-3" });

    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(5);
    expect(res.body.lastReadMessageId).toBe("msg-3");
  });
});

// ---------------------------------------------------------------------------
// Room mark-read route tests
// ---------------------------------------------------------------------------

describe("POST /:chatRoomId/mark-read", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    // Re-arm the happy-path default: individual tests below replace it with
    // rejections, and mockClear does not restore implementations.
    vi.mocked(assertRoomAccess).mockResolvedValue(undefined);
  });

  it("should mark a room as read and return ok with unreadCount", async () => {
    const app = createRoomTestApp();

    const res = await supertest(app)
      .post("/room1/mark-read")
      .send({ lastReadMessageId: "msg-1" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.lastReadMessageId).toBe("msg-1");
    expect(res.body.unreadCount).toBe(0);
  });

  it("should return 400 when lastReadMessageId is missing", async () => {
    const app = createRoomTestApp();

    const res = await supertest(app).post("/room1/mark-read").send({});

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("should return 400 when lastReadMessageId is empty string", async () => {
    const app = createRoomTestApp();

    const res = await supertest(app)
      .post("/room1/mark-read")
      .send({ lastReadMessageId: "" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("should return 404 when chatRoomId param is missing", async () => {
    const app = createRoomTestApp();

    const res = await supertest(app)
      .post("/mark-read")
      .send({ lastReadMessageId: "msg-1" });

    expect(res.status).toBe(404);
  });

  it("should call markRoomRead with correct arguments", async () => {
    const { markRoomRead } =
      await import("../../../src/services/room/markRead");
    vi.mocked(markRoomRead).mockResolvedValue({
      lastReadMessageId: "msg-4",
      unreadCount: 3,
    });

    const app = createRoomTestApp();

    await supertest(app)
      .post("/room1/mark-read")
      .send({ lastReadMessageId: "msg-4" });

    expect(markRoomRead).toHaveBeenCalledWith("user-1", "room1", "msg-4");
  });

  it("should return the unreadCount from the service", async () => {
    const { markRoomRead } =
      await import("../../../src/services/room/markRead");
    vi.mocked(markRoomRead).mockResolvedValue({
      lastReadMessageId: "msg-5",
      unreadCount: 7,
    });

    const app = createRoomTestApp();

    const res = await supertest(app)
      .post("/room1/mark-read")
      .send({ lastReadMessageId: "msg-5" });

    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(7);
    expect(res.body.lastReadMessageId).toBe("msg-5");
  });

  it("should surface the 403 from assertRoomAccess instead of a 500", async () => {
    vi.mocked(assertRoomAccess).mockRejectedValue(
      new ApiError("Not authorized for this room", 403, "FORBIDDEN"),
    );

    const app = createRoomTestApp();

    const res = await supertest(app)
      .post("/room1/mark-read")
      .send({ lastReadMessageId: "msg-1" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("should surface the 404 from markRoomRead instead of a 500", async () => {
    const { markRoomRead } =
      await import("../../../src/services/room/markRead");
    vi.mocked(markRoomRead).mockRejectedValue(
      new ApiError("Message not found", 404, "MESSAGE_NOT_FOUND"),
    );

    const app = createRoomTestApp();

    const res = await supertest(app)
      .post("/room1/mark-read")
      .send({ lastReadMessageId: "missing" });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("MESSAGE_NOT_FOUND");
  });
});
