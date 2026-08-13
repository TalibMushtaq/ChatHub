import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import updateRoomAvatarRouter from "../../../../src/routes/room/updateRoomAvatar";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/room", updateRoomAvatarRouter);
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

beforeAll(() => {
  process.env.AWS_REGION = "us-east-1";
  process.env.AWS_S3_BUCKET_NAME = "test-bucket";
});

vi.mock("../../../../src/middleware/requireAuth", () => ({
  default: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1" };
    next();
  },
}));

describe("PATCH /room/:chatRoomId/avatar", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should reject a non-member", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue(null as any);

    const app = createTestApp();

    const res = await supertest(app)
      .patch("/room/room-1/avatar")
      .send({ avatarKey: "defaults/room/01.png" });

    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
    expect(prismaMock.chatRoom.update).not.toHaveBeenCalled();
  });

  it("should reject a plain MEMBER", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue({
      role: "MEMBER",
    } as any);

    const app = createTestApp();

    const res = await supertest(app)
      .patch("/room/room-1/avatar")
      .send({ avatarKey: "defaults/room/01.png" });

    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
  });

  it("should update the room avatar for an ADMIN", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue({
      role: "ADMIN",
    } as any);
    prismaMock.chatRoom.findUnique.mockResolvedValue({ avatar: null } as any);
    prismaMock.chatRoom.update.mockResolvedValue({} as any);

    const app = createTestApp();

    const res = await supertest(app)
      .patch("/room/room-1/avatar")
      .send({ avatarKey: "avatars/rooms/room-1/new-abc.png" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prismaMock.chatRoom.update).toHaveBeenCalledOnce();
  });

  it("should not delete a replaced default avatar (shared resource)", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue({
      role: "OWNER",
    } as any);
    prismaMock.chatRoom.findUnique.mockResolvedValue({
      avatar: "defaults/room/02.png",
    } as any);
    prismaMock.chatRoom.update.mockResolvedValue({} as any);

    const app = createTestApp();

    const res = await supertest(app)
      .patch("/room/room-1/avatar")
      .send({ avatarKey: "defaults/room/03.png" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("should reject an invalid avatar key", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue({
      role: "OWNER",
    } as any);

    const app = createTestApp();

    const res = await supertest(app)
      .patch("/room/room-1/avatar")
      .send({ avatarKey: "avatars/user-1/not-a-room.png" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(prismaMock.chatRoom.update).not.toHaveBeenCalled();
  });
});
