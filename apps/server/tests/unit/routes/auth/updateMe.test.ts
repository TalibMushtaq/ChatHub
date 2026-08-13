import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import updateMeRouter from "../../../../src/routes/auth/updateMe";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

// Avoid pulling in the real argon2 dependency; the password-change branch is
// covered by validator tests, and the route branch is exercised elsewhere.
vi.mock("../../../../src/services/PasswordService", () => ({
  PasswordService: class {
    verify = vi.fn();
  },
}));

vi.mock("../../../../src/lib/password", () => ({
  hashPassword: vi.fn(async () => "new-hash"),
  PASSWORD_HASH_OPTIONS: {},
}));

vi.mock("../../../../src/middleware/requireAuth", () => ({
  default: (req: any, _res: any, next: any) => {
    req.user = {
      id: "u1",
      email: "u1@example.com",
      username: "user1",
      displayName: "User One",
      avatar: null,
      bio: null,
      gender: null,
      dateOfBirth: null,
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    req.session = { userCache: { cachedAt: 1 } };
    next();
  },
}));

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/auth", updateMeRouter);
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

describe("PATCH /auth/me", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should update profile fields and return the user", async () => {
    prismaMock.user.update.mockResolvedValue({
      id: "u1",
      displayName: "Alice",
      bio: "Hello",
      gender: "FEMALE",
      dateOfBirth: new Date("1990-05-21T00:00:00Z"),
    } as any);

    const res = await supertest(createTestApp()).patch("/auth/me").send({
      displayName: "Alice",
      bio: "Hello",
      gender: "FEMALE",
      dateOfBirth: "1990-05-21",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prismaMock.user.update).toHaveBeenCalledOnce();
    const updateCall = prismaMock.user.update.mock.calls[0]![0] as any;
    expect(updateCall.data.displayName).toBe("Alice");
    expect(updateCall.data.bio).toBe("Hello");
    expect(updateCall.data.gender).toBe("FEMALE");
  });

  it("should allow partial updates", async () => {
    prismaMock.user.update.mockResolvedValue({ id: "u1" } as any);

    const res = await supertest(createTestApp())
      .patch("/auth/me")
      .send({ bio: "Just bio" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const updateCall = prismaMock.user.update.mock.calls[0]![0] as any;
    expect(updateCall.data).toEqual({ bio: "Just bio" });
  });

  it("should reject a request that tries to change the username", async () => {
    const res = await supertest(createTestApp())
      .patch("/auth/me")
      .send({ username: "newname", displayName: "Alice" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain("Username cannot be changed");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("should reject a future date of birth", async () => {
    const res = await supertest(createTestApp())
      .patch("/auth/me")
      .send({ dateOfBirth: new Date(Date.now() + 86400000).toISOString() });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("should reject an invalid gender value", async () => {
    const res = await supertest(createTestApp())
      .patch("/auth/me")
      .send({ gender: "UNKNOWN" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
