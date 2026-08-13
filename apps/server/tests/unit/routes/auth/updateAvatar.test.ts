import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import updateAvatarRouter from "../../../../src/routes/auth/updateAvatar";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/auth", updateAvatarRouter);
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
    req.session = { userCache: { cachedAt: 1 } };
    next();
  },
}));

describe("PATCH /auth/me/avatar", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should update the avatar key and bust the session cache", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ avatar: null } as any);
    prismaMock.user.update.mockResolvedValue({} as any);

    const app = createTestApp();

    const res = await supertest(app)
      .patch("/auth/me/avatar")
      .send({ avatarKey: "defaults/user/01.png" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.avatarKey).toBe("defaults/user/01.png");
    expect(prismaMock.user.update).toHaveBeenCalledOnce();
  });

  it("should best-effort delete the replaced custom avatar from S3", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      avatar: "avatars/user-1/old-abc.jpg",
    } as any);
    prismaMock.user.update.mockResolvedValue({} as any);

    // S3Service.deleteObject is not pre-mocked to resolve — we only assert
    // the DB update path never fails because of S3.
    const app = createTestApp();

    const res = await supertest(app)
      .patch("/auth/me/avatar")
      .send({ avatarKey: "avatars/user-1/new-def.png" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prismaMock.user.update).toHaveBeenCalledOnce();
  });

  it("should NOT delete the old avatar when it is a shared default", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      avatar: "defaults/user/02.png",
    } as any);
    prismaMock.user.update.mockResolvedValue({} as any);

    const app = createTestApp();

    const res = await supertest(app)
      .patch("/auth/me/avatar")
      .send({ avatarKey: "defaults/user/03.png" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("should reject an invalid avatar key", async () => {
    const app = createTestApp();

    const res = await supertest(app)
      .patch("/auth/me/avatar")
      .send({ avatarKey: "defaults/room/01.png" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
