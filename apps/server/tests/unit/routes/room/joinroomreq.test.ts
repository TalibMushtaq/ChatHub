import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import router from "../../../../src/routes/room/joinroomreq";
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

function createTestApp() {
  const app = express();
  app.use(express.json());
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

describe("room joinroomreq routes", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  describe("POST /:roomId/join-request", () => {
    it("creates a join request", async () => {
      const txClient = {
        chatRoomMember: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        roomJoinRequest: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "req-1",
            roomId: "r1",
            userId: "user-1",
            status: "PENDING",
          }),
        },
      };
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(txClient as any),
      );

      const res = await supertest(createTestApp()).post(
        "/room/r1/join-request",
      );

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.joinRequest).toMatchObject({ id: "req-1" });
    });

    it("returns 400 when already a member", async () => {
      const txClient = {
        chatRoomMember: {
          findUnique: vi.fn().mockResolvedValue({ role: "MEMBER" }),
        },
        roomJoinRequest: { findFirst: vi.fn(), create: vi.fn() },
      };
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(txClient as any),
      );

      const res = await supertest(createTestApp()).post(
        "/room/r1/join-request",
      );

      expect(res.status).toBe(400);
    });
  });

  describe("GET /:roomId/join-requests", () => {
    it("returns join requests for a room", async () => {
      prismaMock.roomJoinRequest.findMany.mockResolvedValue([
        {
          id: "req-1",
          roomId: "r1",
          userId: "user-2",
          status: "PENDING",
          user: { id: "user-2", username: "bob" },
          reviewedBy: null,
        },
      ] as any);

      const res = await supertest(createTestApp()).get(
        "/room/r1/join-requests",
      );

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.requests).toHaveLength(1);
    });
  });

  describe("PATCH /:roomId/join-requests/:requestId", () => {
    it("approves a join request", async () => {
      prismaMock.roomJoinRequest.findUnique.mockResolvedValue({
        id: "req-1",
        roomId: "r1",
        userId: "user-2",
        status: "PENDING",
      } as any);

      const txClient = {
        chatRoomMember: {
          create: vi.fn().mockResolvedValue({}),
        },
        roomJoinRequest: {
          update: vi.fn().mockResolvedValue({}),
        },
      };
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(txClient as any),
      );

      const res = await supertest(createTestApp())
        .patch("/room/r1/join-requests/req-1")
        .send({ action: "APPROVED" });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("returns 404 when request not found", async () => {
      prismaMock.roomJoinRequest.findUnique.mockResolvedValue(null);

      const res = await supertest(createTestApp())
        .patch("/room/r1/join-requests/req-999")
        .send({ action: "APPROVED" });

      expect(res.status).toBe(404);
    });

    it("returns 400 when request already reviewed", async () => {
      prismaMock.roomJoinRequest.findUnique.mockResolvedValue({
        id: "req-1",
        roomId: "r1",
        userId: "user-2",
        status: "APPROVED",
      } as any);

      const res = await supertest(createTestApp())
        .patch("/room/r1/join-requests/req-1")
        .send({ action: "APPROVED" });

      expect(res.status).toBe(400);
    });
  });
});
