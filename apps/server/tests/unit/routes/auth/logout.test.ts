import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express from "express";
import logoutRouter from "../../../../src/routes/auth/logout";

type DestroyCallback = (err?: Error | null) => void;

function createTestApp(
  session: { destroy: (cb: DestroyCallback) => void } | null,
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = session;
    next();
  });
  app.use("/auth", logoutRouter);
  return app;
}

describe("POST /auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should destroy the session and clear the session cookie", async () => {
    const destroy = vi.fn((cb: DestroyCallback) => cb(null));
    const res = await supertest(createTestApp({ destroy })).post(
      "/auth/logout",
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(destroy).toHaveBeenCalledOnce();
    expect(res.headers["set-cookie"]?.[0]).toContain("chathubby.sid=;");
  });

  it("should succeed when there is no session to destroy", async () => {
    const res = await supertest(createTestApp(null)).post("/auth/logout");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("should return 500 when the session store fails to destroy the session", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const destroy = vi.fn((cb: DestroyCallback) => cb(new Error("store down")));

    const res = await supertest(createTestApp({ destroy })).post(
      "/auth/logout",
    );

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ ok: false, error: "Failed to logout" });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
