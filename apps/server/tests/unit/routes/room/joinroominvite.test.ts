import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import router from "../../../../src/routes/room/joinroominvite";
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

describe("room joinroominvite routes", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  describe("POST /:roomId/invitations", () => {
    it("creates an invitation successfully", async () => {
      const txClient = {
        chatRoomMember: { findUnique: vi.fn().mockResolvedValue(null) },
        roomInvitation: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "inv-1",
            createdAt: new Date("2026-01-01"),
            status: "PENDING",
          }),
        },
      };
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(txClient as any),
      );

      const res = await supertest(createTestApp())
        .post("/room/r1/invitations")
        .send({ targetUserId: "user-2" });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        ok: true,
        id: "inv-1",
        status: "PENDING",
      });
    });

    it("rejects self-invite with 400", async () => {
      const res = await supertest(createTestApp())
        .post("/room/r1/invitations")
        .send({ targetUserId: "user-1" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cannot invite yourself/i);
    });

    it("returns 409 when target is already a member", async () => {
      const txClient = {
        chatRoomMember: {
          findUnique: vi.fn().mockResolvedValue({ role: "MEMBER" }),
        },
        roomInvitation: { findFirst: vi.fn(), create: vi.fn() },
      };
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(txClient as any),
      );

      const res = await supertest(createTestApp())
        .post("/room/r1/invitations")
        .send({ targetUserId: "user-2" });

      expect(res.status).toBe(409);
    });
  });

  describe("GET /invitation/sent", () => {
    it("returns sent invitations", async () => {
      prismaMock.roomInvitation.findMany.mockResolvedValue([
        {
          id: "inv-1",
          status: "PENDING",
          createdAt: new Date(),
          room: { id: "r1", name: "Test Room" },
          invitedUser: { id: "user-2", username: "bob" },
        },
      ] as any);

      const res = await supertest(createTestApp()).get("/room/invitation/sent");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.invitations).toHaveLength(1);
    });
  });

  describe("GET /invitation/received", () => {
    it("returns received invitations", async () => {
      prismaMock.roomInvitation.findMany.mockResolvedValue([
        {
          id: "inv-2",
          createdAt: new Date(),
          room: { id: "r1", name: "Test Room" },
          invitedBy: { id: "user-3", username: "alice" },
        },
      ] as any);

      const res = await supertest(createTestApp()).get(
        "/room/invitation/received",
      );

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.invitations).toHaveLength(1);
    });
  });

  describe("PATCH /invitations/:invitationId", () => {
    it("rejects an invitation", async () => {
      prismaMock.roomInvitation.updateMany.mockResolvedValue({ count: 1 });

      const res = await supertest(createTestApp())
        .patch("/room/invitations/inv-1")
        .send({ status: "REJECTED" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, status: "REJECTED" });
    });

    it("returns 409 when invitation already processed", async () => {
      prismaMock.roomInvitation.updateMany.mockResolvedValue({ count: 0 });

      const res = await supertest(createTestApp())
        .patch("/room/invitations/inv-1")
        .send({ status: "REJECTED" });

      expect(res.status).toBe(409);
    });

    it("accepts an invitation", async () => {
      const txClient = {
        roomInvitation: {
          findUnique: vi.fn().mockResolvedValue({
            id: "inv-1",
            roomId: "r1",
            invitedUserId: "user-1",
            status: "PENDING",
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        roomBan: { findUnique: vi.fn().mockResolvedValue(null) },
        chatRoomMember: { create: vi.fn().mockResolvedValue({}) },
      };
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(txClient as any),
      );

      const res = await supertest(createTestApp())
        .patch("/room/invitations/inv-1")
        .send({ status: "ACCEPTED" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, status: "ACCEPTED" });
    });
  });
});
