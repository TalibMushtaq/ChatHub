import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import checkUsernameRouter from "../../../../src/routes/auth/checkUsername";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/auth", checkUsernameRouter);
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

vi.mock("../../../../src/lib/rateLimiter", () => ({
  createRateLimiter: () => async () => ({ allowed: true }),
  setRateLimitHeaders: () => {},
}));

describe("GET /auth/check-username", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should return available=true when the username is free", async () => {
    prismaMock.user.count.mockResolvedValue(0);

    const res = await supertest(createTestApp())
      .get("/auth/check-username")
      .query({ username: "newuser" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, available: true });
    expect(prismaMock.user.count).toHaveBeenCalledWith({
      where: { username: "newuser" },
    });
  });

  it("should return available=false when the username is taken", async () => {
    prismaMock.user.count.mockResolvedValue(1);

    const res = await supertest(createTestApp())
      .get("/auth/check-username")
      .query({ username: "existing" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, available: false });
  });

  it("should normalize usernames to lowercase", async () => {
    prismaMock.user.count.mockResolvedValue(0);

    await supertest(createTestApp())
      .get("/auth/check-username")
      .query({ username: "NewUser_1" });

    expect(prismaMock.user.count).toHaveBeenCalledWith({
      where: { username: "newuser_1" },
    });
  });

  it("should reject an invalid username format", async () => {
    prismaMock.user.count.mockResolvedValue(0);

    const res = await supertest(createTestApp())
      .get("/auth/check-username")
      .query({ username: "bad-name!" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });
});
