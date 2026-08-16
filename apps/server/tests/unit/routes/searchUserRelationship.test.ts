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

import { getRelationships } from "../../../src/services/friends/getRelationships";

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
