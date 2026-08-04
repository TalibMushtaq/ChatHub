import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import attachmentRoutes from "../../../src/routes/attachments";
import { prismaMock, resetPrismaMock } from "../../mocks/prisma";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/attachments", attachmentRoutes);
  // Error handler to prevent Express default 500 HTML responses
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

// Set AWS env vars so S3Service initializes with mocked AWS SDK
beforeAll(() => {
  process.env.AWS_REGION = "us-east-1";
  process.env.AWS_S3_BUCKET_NAME = "test-bucket";
});

// Mock requireAuth middleware
vi.mock("../../../src/middleware/requireAuth", () => ({
  default: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1" };
    next();
  },
}));

// Mock rate limiter
vi.mock("../../../src/lib/rateLimiter", () => ({
  createRateLimiter: vi.fn().mockReturnValue(
    vi.fn().mockResolvedValue({ allowed: true, remaining: 100 }),
  ),
  setRateLimitHeaders: vi.fn(),
}));

describe("POST /attachments/presign", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should create a PENDING attachment and return presigned URL", async () => {
    prismaMock.attachment.create.mockResolvedValue({
      id: "att-1",
      s3Key: "attachments/dm/dc1/uuid.jpg",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
      status: "PENDING",
      createdAt: new Date(),
    } as any);

    const app = createTestApp();

    const res = await supertest(app)
      .post("/attachments/presign")
      .send({
        context: "dm",
        contextId: "dc1",
        filename: "photo.jpg",
        mimeType: "image/jpeg",
        size: 1024,
      });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.attachmentId).toBe("att-1");
    expect(res.body.presignedUrl).toBe("https://s3.mock/presigned-url");
    expect(prismaMock.attachment.create).toHaveBeenCalledOnce();
  });

  it("should reject invalid MIME type", async () => {
    const app = createTestApp();

    const res = await supertest(app)
      .post("/attachments/presign")
      .send({
        context: "dm",
        contextId: "dc1",
        filename: "evil.exe",
        mimeType: "application/x-msdownload",
        size: 1024,
      });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("should reject oversized file", async () => {
    const app = createTestApp();

    const res = await supertest(app)
      .post("/attachments/presign")
      .send({
        context: "dm",
        contextId: "dc1",
        filename: "big.zip",
        mimeType: "application/zip",
        size: 101 * 1024 * 1024,
      });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

describe("GET /attachments/:attachmentId", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should return download URL for DM attachment", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({
      id: "att-1",
      s3Key: "attachments/dm/dc1/uuid.jpg",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
      width: null,
      height: null,
      thumbnailKey: null,
      status: "ATTACHED",
      uploaderId: "user-1",
      Message: {
        chatRoomId: null,
        directChatId: "dc1",
      },
    } as any);

    prismaMock.directChat.findUnique.mockResolvedValue({
      id: "dc1",
      user1Id: "user-1",
      user2Id: "user-2",
    } as any);

    const app = createTestApp();

    const res = await supertest(app).get("/attachments/att-1");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.downloadUrl).toBe("https://s3.mock/presigned-url");
  });

  it("should reject access to another user's DM attachment", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({
      id: "att-1",
      s3Key: "attachments/dm/dc1/uuid.jpg",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
      width: null,
      height: null,
      thumbnailKey: null,
      status: "ATTACHED",
      uploaderId: "user-2",
      Message: {
        chatRoomId: null,
        directChatId: "dc1",
      },
    } as any);

    prismaMock.directChat.findUnique.mockResolvedValue({
      id: "dc1",
      user1Id: "user-2",
      user2Id: "user-3",
    } as any);

    const app = createTestApp();

    const res = await supertest(app).get("/attachments/att-1");

    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
  });
});

describe("DELETE /attachments/:attachmentId", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should delete a PENDING attachment owned by the user", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({
      id: "att-1",
      s3Key: "attachments/dm/dc1/uuid.jpg",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
      status: "PENDING",
      uploaderId: "user-1",
      Message: null,
    } as any);

    prismaMock.attachment.delete.mockResolvedValue({} as any);

    const app = createTestApp();

    const res = await supertest(app).delete("/attachments/att-1");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prismaMock.attachment.delete).toHaveBeenCalledOnce();
  });
});
