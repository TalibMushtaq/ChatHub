import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import router from "../../../../src/routes/room/joinroomlink";
import {
  resetPrismaMock,
  prismaMock,
  createMockTransaction,
} from "../../../mocks/prisma";

vi.mock("../../../../src/middleware/requireAuth", () => ({
  default: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1" };
    next();
  },
}));

vi.mock("../../../../src/middleware/requireAdmin", () => ({
  requireAdmin: (_req: any, _res: any, next: any) => {
    next();
  },
}));

vi.mock("../../../../src/db/prisma", () => ({
  prisma: prismaMock,
}));

const emitSpy = vi.fn();
const ioSpy = {
  to: vi.fn(() => ({ emit: emitSpy })),
};

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: Response, next: NextFunction) => {
    req.io = ioSpy;
    next();
  });
  app.use("/room", router);
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

describe("room joinroomlink routes", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    ioSpy.to.mockClear();
    emitSpy.mockClear();
  });

  describe("POST /:roomId/join-links", () => {
    it("creates a join link", async () => {
      prismaMock.roomJoinLink.create.mockResolvedValue({
        id: "link-1",
        token: "hashed",
        maxUses: 10,
        expiresAt: null,
      } as any);

      const res = await supertest(createTestApp())
        .post("/room/r1/join-links")
        .send({ maxUses: 10 });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.link).toHaveProperty("id");
      expect(res.body.link).toHaveProperty("token");
    });

    it("returns 400 on invalid input", async () => {
      const res = await supertest(createTestApp())
        .post("/room/r1/join-links")
        .send({ maxUses: -1 });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /join/:token", () => {
    it("returns room info for a valid token", async () => {
      prismaMock.roomJoinLink.findUnique.mockResolvedValue({
        token: "hashed",
        isActive: true,
        usedCount: 0,
        expiresAt: null,
        maxUses: 10,
        room: { id: "r1", name: "Test Room", description: "desc" },
      } as any);

      const res = await supertest(createTestApp()).get("/room/join/some-token");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.room).toMatchObject({ id: "r1", name: "Test Room" });
    });

    it("returns 404 for non-existent token", async () => {
      prismaMock.roomJoinLink.findUnique.mockResolvedValue(null);

      const res = await supertest(createTestApp()).get("/room/join/bad-token");

      expect(res.status).toBe(404);
    });
  });

  describe("POST /join/:token", () => {
    it("joins a room successfully", async () => {
      const txClient = {
        roomJoinLink: {
          findUnique: vi.fn().mockResolvedValue({
            id: "link-1",
            token: "hashed",
            roomId: "r1",
            isActive: true,
            usedCount: 0,
            expiresAt: null,
            maxUses: null,
          }),
          update: vi.fn().mockResolvedValue({}),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        roomBan: { findUnique: vi.fn().mockResolvedValue(null) },
        chatRoomMember: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({}),
        },
      };
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(txClient as any),
      );
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        id: "m1",
        role: "MEMBER",
        joinedAt: new Date(),
        nickname: null,
        mutedUntil: null,
        User: {
          id: "user-1",
          username: "alice",
          displayName: "Alice",
          avatar: null,
        },
      } as any);

      const res = await supertest(createTestApp()).post(
        "/room/join/some-token",
      );

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("returns 409 when already a member", async () => {
      const txClient = {
        roomJoinLink: {
          findUnique: vi.fn().mockResolvedValue({
            id: "link-1",
            token: "hashed",
            roomId: "r1",
            isActive: true,
            usedCount: 0,
            expiresAt: null,
            maxUses: null,
          }),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
        roomBan: { findUnique: vi.fn().mockResolvedValue(null) },
        chatRoomMember: {
          findUnique: vi.fn().mockResolvedValue({ id: "existing" }),
          create: vi.fn(),
        },
      };
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(txClient as any),
      );

      const res = await supertest(createTestApp()).post(
        "/room/join/some-token",
      );

      expect(res.status).toBe(409);
    });
  });

  describe("PATCH /:roomId/join-links/:linkId", () => {
    it("deactivates a link", async () => {
      prismaMock.roomJoinLink.findUnique.mockResolvedValue({
        id: "link-1",
        roomId: "r1",
        isActive: true,
      } as any);
      prismaMock.roomJoinLink.update.mockResolvedValue({} as any);

      const res = await supertest(createTestApp()).patch(
        "/room/r1/join-links/link-1",
      );

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.message).toMatch(/deactivated/i);
    });

    it("returns 404 when link not found", async () => {
      prismaMock.roomJoinLink.findUnique.mockResolvedValue(null);

      const res = await supertest(createTestApp()).patch(
        "/room/r1/join-links/link-999",
      );

      expect(res.status).toBe(404);
    });
  });

  describe("GET /join-links/mine", () => {
    it("returns the user's join links", async () => {
      prismaMock.roomJoinLink.findMany.mockResolvedValue([
        {
          id: "link-1",
          token: "hashed",
          maxUses: 10,
          usedCount: 3,
          expiresAt: null,
          isActive: true,
          createdAt: new Date(),
          room: { id: "r1", name: "Test Room" },
        },
      ] as any);

      const res = await supertest(createTestApp()).get("/room/join-links/mine");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.links).toHaveLength(1);
    });
  });
});
