import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import avatarRoutes from "../../../src/routes/avatars";
import { prismaMock, resetPrismaMock } from "../../mocks/prisma";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/avatars", avatarRoutes);
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

// S3Service needs env vars so getRequiredS3Service() can build its client.
beforeAll(() => {
  process.env.AWS_REGION = "us-east-1";
  process.env.AWS_S3_BUCKET_NAME = "test-bucket";
});

vi.mock("../../../src/middleware/requireAuth", () => ({
  default: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1" };
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

describe("POST /avatars/presign", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should return a presigned PUT URL + key for a user avatar", async () => {
    const app = createTestApp();

    const res = await supertest(app)
      .post("/avatars/presign")
      .send({
        context: "user",
        filename: "me.png",
        mimeType: "image/png",
        size: 1024 * 1024,
      });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.presignedUrl).toBe("https://s3.mock/presigned-url");
    expect(res.body.s3Key).toMatch(/^avatars\/user-1\/[0-9a-f-]+\.png$/);
    expect(prismaMock.chatRoomMember.findUnique).not.toHaveBeenCalled();
  });

  it("should derive the extension from MIME type, not the filename", async () => {
    const app = createTestApp();

    // Filename claims .png but MIME says jpeg — the key must use .jpg.
    const res = await supertest(app).post("/avatars/presign").send({
      context: "user",
      filename: "photo.png",
      mimeType: "image/jpeg",
      size: 1024,
    });

    expect(res.status).toBe(201);
    expect(res.body.s3Key).toMatch(/\.jpg$/);
  });

  it("should accept a room avatar presign for an OWNER", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue({
      role: "OWNER",
    } as any);

    const app = createTestApp();

    const res = await supertest(app).post("/avatars/presign").send({
      context: "room",
      contextId: "room-1",
      filename: "team.png",
      mimeType: "image/png",
      size: 1024,
    });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.s3Key).toMatch(/^avatars\/rooms\/room-1\/[0-9a-f-]+\.png$/);
  });

  it("should reject a room avatar presign for a plain MEMBER", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue({
      role: "MEMBER",
    } as any);

    const app = createTestApp();

    const res = await supertest(app).post("/avatars/presign").send({
      context: "room",
      contextId: "room-1",
      filename: "team.png",
      mimeType: "image/png",
      size: 1024,
    });

    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
  });

  it("should reject a room avatar presign for a non-member", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue(null as any);

    const app = createTestApp();

    const res = await supertest(app).post("/avatars/presign").send({
      context: "room",
      contextId: "room-1",
      filename: "team.png",
      mimeType: "image/png",
      size: 1024,
    });

    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
  });

  it("should reject a room presign without contextId", async () => {
    const app = createTestApp();

    const res = await supertest(app).post("/avatars/presign").send({
      context: "room",
      filename: "team.png",
      mimeType: "image/png",
      size: 1024,
    });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("should reject SVG avatars", async () => {
    const app = createTestApp();

    const res = await supertest(app).post("/avatars/presign").send({
      context: "user",
      filename: "evil.svg",
      mimeType: "image/svg+xml",
      size: 1024,
    });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("should reject files larger than 5 MB", async () => {
    const app = createTestApp();

    const res = await supertest(app)
      .post("/avatars/presign")
      .send({
        context: "user",
        filename: "huge.png",
        mimeType: "image/png",
        size: 6 * 1024 * 1024,
      });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});
