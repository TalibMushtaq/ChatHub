import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import searchRouter from "../../../src/routes/searchUser";
import { prismaMock, resetPrismaMock } from "../../mocks/prisma";

vi.mock("../../../src/middleware/requireAuth", () => ({
  default: (req: any, _res: any, next: any) => {
    req.user = { id: "u1", username: "alice", displayName: null };
    req.session = {};
    next();
  },
}));

vi.mock("../../../src/services/friends/getRelationships", () => ({
  getRelationships: vi.fn(),
}));

vi.mock("../../../src/services/friends/getRelationship", () => ({
  getRelationship: vi.fn(),
}));

vi.mock("../../../src/services/friends/getPendingRequestId", () => ({
  getPendingRequestId: vi.fn(),
}));

import { getRelationships } from "../../../src/services/friends/getRelationships";
import { getRelationship } from "../../../src/services/friends/getRelationship";
import { getPendingRequestId } from "../../../src/services/friends/getPendingRequestId";

function createTestApp() {
  const app = express();
  app.use("/search", searchRouter);
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

describe("GET /search/users/search", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    vi.mocked(getRelationships).mockResolvedValue(
      new Map([
        ["u2", "FRIENDS"],
        ["u3", "NONE"],
      ]),
    );
  });

  it("annotates every result with its relationship to the actor", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u2", username: "bob", displayName: null },
      { id: "u3", username: "carol", displayName: null },
    ] as any);

    const res = await supertest(createTestApp()).get(
      "/search/users/search?query=bo",
    );

    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([
      { id: "u2", username: "bob", displayName: null, relationship: "FRIENDS" },
      { id: "u3", username: "carol", displayName: null, relationship: "NONE" },
    ]);
    // The batch helper receives exactly the result ids — no per-row queries.
    expect(getRelationships).toHaveBeenCalledWith("u1", ["u2", "u3"]);
  });

  it("defaults an unknown relationship to NONE", async () => {
    vi.mocked(getRelationships).mockResolvedValue(new Map());
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u9", username: "zed", displayName: null },
    ] as any);

    const res = await supertest(createTestApp()).get(
      "/search/users/search?query=ze",
    );

    expect(res.body.users[0].relationship).toBe("NONE");
  });
});

describe("GET /search/users/:id", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    vi.mocked(getRelationship).mockResolvedValue("NONE");
  });

  it("returns the full public profile with the derived relationship", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      username: "bob",
      displayName: "Bob",
      avatar: "avatars/u2/x.png",
      bio: "Hello!",
      gender: "MALE",
      dateOfBirth: new Date("2000-05-01T00:00:00Z"),
      createdAt: new Date("2024-01-01T00:00:00Z"),
    } as any);
    vi.mocked(getRelationship).mockResolvedValue("FRIENDS");

    const res = await supertest(createTestApp()).get(
      "/search/users/11111111-1111-4111-8111-111111111111",
    );

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      username: "bob",
      displayName: "Bob",
      avatar: "avatars/u2/x.png",
      bio: "Hello!",
      gender: "MALE",
      dateOfBirth: "2000-05-01T00:00:00.000Z",
      createdAt: "2024-01-01T00:00:00.000Z",
      relationship: "FRIENDS",
      friendRequestId: null,
    });
    expect(getRelationship).toHaveBeenCalledWith(
      "u1",
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("includes the pending request id when a request is in flight", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      username: "bob",
      displayName: null,
      avatar: null,
      bio: null,
      gender: null,
      dateOfBirth: null,
      createdAt: new Date("2024-01-01T00:00:00Z"),
    } as any);
    vi.mocked(getRelationship).mockResolvedValue("REQUEST_SENT");
    vi.mocked(getPendingRequestId).mockResolvedValue("fr1");

    const res = await supertest(createTestApp()).get(
      "/search/users/11111111-1111-4111-8111-111111111111",
    );

    expect(res.status).toBe(200);
    expect(res.body.user.friendRequestId).toBe("fr1");
    expect(getPendingRequestId).toHaveBeenCalledWith(
      "u1",
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("404s when the user does not exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await supertest(createTestApp()).get(
      "/search/users/22222222-2222-4222-8222-222222222222",
    );

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("USER_NOT_FOUND");
  });
});
