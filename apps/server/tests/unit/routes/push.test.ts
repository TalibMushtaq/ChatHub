import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import pushRouter from "../../../src/routes/push";
import { prismaMock, resetPrismaMock } from "../../mocks/prisma";

let mockSession: { userCache: { cachedAt: number } };

vi.mock("../../../src/middleware/requireAuth", () => ({
  default: (req: any, _res: any, next: any) => {
    req.user = { id: "u1", username: "alice", displayName: null };
    mockSession = { userCache: { cachedAt: 999 } };
    req.session = mockSession;
    next();
  },
}));

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/push", pushRouter);
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

describe("POST /push/subscribe", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("upserts the subscription for the authenticated user", async () => {
    prismaMock.pushSubscription.upsert.mockResolvedValue({} as any);

    const res = await supertest(createTestApp())
      .post("/push/subscribe")
      .send({
        endpoint: "https://push.example/sub1",
        keys: { p256dh: "abc", auth: "xyz" },
      });

    expect(res.status).toBe(201);
    expect(prismaMock.pushSubscription.upsert).toHaveBeenCalledWith({
      where: { endpoint: "https://push.example/sub1" },
      create: {
        userId: "u1",
        endpoint: "https://push.example/sub1",
        p256dh: "abc",
        auth: "xyz",
      },
      update: { userId: "u1", p256dh: "abc", auth: "xyz" },
    });
  });

  it("rejects an invalid endpoint", async () => {
    const res = await supertest(createTestApp())
      .post("/push/subscribe")
      .send({
        endpoint: "not-a-url",
        keys: { p256dh: "abc", auth: "xyz" },
      });

    expect(res.status).toBe(400);
    expect(prismaMock.pushSubscription.upsert).not.toHaveBeenCalled();
  });

  it("rejects missing key material", async () => {
    const res = await supertest(createTestApp())
      .post("/push/subscribe")
      .send({
        endpoint: "https://push.example/sub1",
        keys: { p256dh: "" },
      });

    expect(res.status).toBe(400);
    expect(prismaMock.pushSubscription.upsert).not.toHaveBeenCalled();
  });
});

describe("DELETE /push/subscribe", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("deletes the caller's subscription for the endpoint", async () => {
    prismaMock.pushSubscription.deleteMany.mockResolvedValue({
      count: 1,
    } as any);

    const res = await supertest(createTestApp())
      .delete("/push/subscribe")
      .send({ endpoint: "https://push.example/sub1" });

    expect(res.status).toBe(200);
    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", endpoint: "https://push.example/sub1" },
    });
  });

  it("rejects an invalid endpoint", async () => {
    const res = await supertest(createTestApp())
      .delete("/push/subscribe")
      .send({ endpoint: "" });

    expect(res.status).toBe(400);
    expect(prismaMock.pushSubscription.deleteMany).not.toHaveBeenCalled();
  });
});
