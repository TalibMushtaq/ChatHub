import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import updateStatusRouter from "../../../../src/routes/auth/updateStatus";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

const reqIo = {
  to: vi.fn(() => ({ emit: vi.fn() })),
  except: vi.fn(() => ({ emit: vi.fn() })),
};

// Captured by the requireAuth mock so tests can assert session mutation.
let mockSession: { userCache: { cachedAt: number } };

vi.mock("../../../../src/middleware/requireAuth", () => ({
  default: (req: any, _res: any, next: any) => {
    req.user = { id: "u1" };
    req.io = reqIo;
    mockSession = { userCache: { cachedAt: 12345 } };
    req.session = mockSession;
    next();
  },
}));

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/auth", updateStatusRouter);
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

describe("PATCH /auth/me/status", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("updates status and custom status and returns the updated user", async () => {
    prismaMock.user.update.mockResolvedValue({
      id: "u1",
      status: "DND",
      customStatus: "In a meeting",
    } as any);

    const res = await supertest(createTestApp())
      .patch("/auth/me/status")
      .send({ status: "DND", customStatus: "In a meeting" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user).toEqual({
      id: "u1",
      status: "DND",
      customStatus: "In a meeting",
    });

    const call = prismaMock.user.update.mock.calls[0]![0] as any;
    expect(call.where).toEqual({ id: "u1" });
    expect(call.data).toEqual({ status: "DND", customStatus: "In a meeting" });
    expect(call.select).toEqual({ id: true, status: true, customStatus: true });
  });

  it("supports partial updates", async () => {
    prismaMock.user.update.mockResolvedValue({
      id: "u1",
      status: "AVAILABLE",
      customStatus: null,
    } as any);

    const res = await supertest(createTestApp())
      .patch("/auth/me/status")
      .send({ customStatus: "Working" });

    expect(res.status).toBe(200);
    const call = prismaMock.user.update.mock.calls[0]![0] as any;
    expect(call.data).toEqual({ customStatus: "Working" });
  });

  it("normalizes an empty custom status to null", async () => {
    prismaMock.user.update.mockResolvedValue({
      id: "u1",
      status: "AVAILABLE",
      customStatus: null,
    } as any);

    await supertest(createTestApp())
      .patch("/auth/me/status")
      .send({ customStatus: "   " });

    const call = prismaMock.user.update.mock.calls[0]![0] as any;
    expect(call.data).toEqual({ customStatus: null });
  });

  it("busts the session cache so /auth/me returns fresh status", async () => {
    prismaMock.user.update.mockResolvedValue({
      id: "u1",
      status: "BUSY",
      customStatus: null,
    } as any);

    await supertest(createTestApp())
      .patch("/auth/me/status")
      .send({ status: "BUSY" });

    expect(mockSession.userCache.cachedAt).toBe(0);
  });

  it("rejects an invalid status value", async () => {
    const res = await supertest(createTestApp())
      .patch("/auth/me/status")
      .send({ status: "SLEEPING" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rejects unknown fields via strict validation", async () => {
    const res = await supertest(createTestApp())
      .patch("/auth/me/status")
      .send({ status: "BUSY", sneaky: true });

    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rejects an empty update", async () => {
    const res = await supertest(createTestApp())
      .patch("/auth/me/status")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe("Nothing to update");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rejects an over-long custom status", async () => {
    const res = await supertest(createTestApp())
      .patch("/auth/me/status")
      .send({ customStatus: "x".repeat(200) });

    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
