import { describe, it, expect, vi } from "vitest";
import supertest from "supertest";
import express from "express";
import meRouter from "../../../../src/routes/auth/me";

vi.mock("../../../../src/middleware/requireAuth", () => ({
  default: (req: any, res: any, next: any) => {
    if (req.headers["x-anonymous"]) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
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
    next();
  },
}));

function createTestApp() {
  const app = express();
  app.use("/auth", meRouter);
  return app;
}

describe("GET /auth/me", () => {
  it("should return the authenticated user attached by requireAuth", async () => {
    const res = await supertest(createTestApp()).get("/auth/me");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      user: {
        id: "u1",
        email: "u1@example.com",
        username: "user1",
        displayName: "User One",
        avatar: null,
        bio: null,
        gender: null,
        dateOfBirth: null,
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    });
  });

  it("should not reach the handler when the request is unauthenticated", async () => {
    const res = await supertest(createTestApp())
      .get("/auth/me")
      .set("x-anonymous", "1");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ ok: false, error: "Unauthorized" });
  });
});
