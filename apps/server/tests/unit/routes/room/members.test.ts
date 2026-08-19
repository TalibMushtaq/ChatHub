import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import membersRouter from "../../../../src/routes/room/members";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

// Mock the auth middleware so every request is an authenticated user.
vi.mock("../../../../src/middleware/requireAuth", () => ({
  default: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1" };
    next();
  },
}));

// Shared io spy so routes' socket emissions can be asserted.
const ioSpy = {
  to: vi.fn(() => ({ emit: vi.fn() })),
};

function createTestApp() {
  const app = express();
  app.use(express.json());
  // Inject a mock Socket.IO server into every request.
  app.use((req: any, _res: Response, next: NextFunction) => {
    req.io = ioSpy;
    next();
  });
  app.use("/room", membersRouter);
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

function memberRow(overrides: Partial<any> = {}) {
  return {
    id: "m1",
    userId: "u2",
    chatRoomId: "r1",
    role: "MEMBER",
    joinedAt: new Date("2026-01-01"),
    nickname: null,
    mutedUntil: null,
    User: {
      id: "u2",
      username: "user2",
      displayName: null,
      avatar: null,
    },
    ...overrides,
  };
}

describe("room members routes", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    ioSpy.to.mockClear();
  });

  it("PATCH role changes the member's role and emits a socket event", async () => {
    prismaMock.chatRoomMember.findUnique
      .mockResolvedValueOnce({ role: "OWNER" } as any)
      .mockResolvedValueOnce(memberRow() as any);
    prismaMock.chatRoomMember.update.mockResolvedValue(
      memberRow({ role: "MODERATOR" }) as any,
    );

    const res = await supertest(createTestApp())
      .patch("/room/r1/members/u2/role")
      .send({ role: "MODERATOR" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.member.role).toBe("MODERATOR");
    expect(ioSpy.to).toHaveBeenCalledWith("room:r1");
  });

  it("POST kick removes the member and emits member:removed", async () => {
    prismaMock.chatRoomMember.findUnique
      .mockResolvedValueOnce({ role: "OWNER" } as any)
      .mockResolvedValueOnce(memberRow() as any);
    prismaMock.$transaction.mockImplementation((ops: any[]) =>
      Promise.all(ops),
    );

    const res = await supertest(createTestApp()).post(
      "/room/r1/members/u2/kick",
    );

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prismaMock.chatRoomMember.deleteMany).toHaveBeenCalled();
    expect(ioSpy.to).toHaveBeenCalledWith("room:r1");
  });

  it("POST ban records a ban, kicks, and emits member:removed", async () => {
    prismaMock.chatRoomMember.findUnique
      .mockResolvedValueOnce({ role: "OWNER" } as any)
      .mockResolvedValueOnce(memberRow() as any);
    prismaMock.roomBan.upsert.mockResolvedValue({ id: "b1" } as any);
    prismaMock.$transaction.mockImplementation(async (fn: any) =>
      fn(prismaMock),
    );

    const res = await supertest(createTestApp())
      .post("/room/r1/members/u2/ban")
      .send({ reason: "spam" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prismaMock.roomBan.upsert).toHaveBeenCalled();
    expect(ioSpy.to).toHaveBeenCalledWith("room:r1");
  });

  it("DELETE ban unbans a banned user", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue({
      role: "OWNER",
    } as any);
    prismaMock.roomBan.deleteMany.mockResolvedValue({ count: 1 } as any);

    const res = await supertest(createTestApp()).delete(
      "/room/r1/members/u2/ban",
    );

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("POST mute sets mutedUntil and emits member:muted", async () => {
    prismaMock.chatRoomMember.findUnique
      .mockResolvedValueOnce({ role: "OWNER" } as any)
      .mockResolvedValueOnce(memberRow() as any);
    const mutedUntil = new Date(Date.now() + 60_000);
    prismaMock.chatRoomMember.update.mockResolvedValue(
      memberRow({ mutedUntil }) as any,
    );

    const res = await supertest(createTestApp())
      .post("/room/r1/members/u2/mute")
      .send({ durationMinutes: 1 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(ioSpy.to).toHaveBeenCalledWith("room:r1");
  });

  it("rejects a mute without a valid duration", async () => {
    const res = await supertest(createTestApp())
      .post("/room/r1/members/u2/mute")
      .send({ durationMinutes: 0 });

    expect(res.status).toBe(400);
  });

  it("PATCH nickname sets the member's nickname", async () => {
    prismaMock.chatRoomMember.findUnique
      .mockResolvedValueOnce({ role: "ADMIN" } as any)
      .mockResolvedValueOnce(memberRow() as any)
      .mockResolvedValueOnce(memberRow() as any);
    prismaMock.chatRoomMember.update.mockResolvedValue(
      memberRow({ nickname: "Cool" }) as any,
    );

    const res = await supertest(createTestApp())
      .patch("/room/r1/members/u2/nickname")
      .send({ nickname: "Cool" });

    expect(res.status).toBe(200);
    expect(res.body.member.nickname).toBe("Cool");
    expect(ioSpy.to).toHaveBeenCalledWith("room:r1");
  });

  it("GET bans lists the room's bans for a member", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue({
      id: "m-me",
    } as any);
    prismaMock.roomBan.findMany.mockResolvedValue([] as any);

    const res = await supertest(createTestApp()).get("/room/r1/bans");

    expect(res.status).toBe(200);
    expect(res.body.bans).toEqual([]);
  });
});
