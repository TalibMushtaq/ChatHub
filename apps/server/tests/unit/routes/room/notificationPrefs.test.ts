import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import { notificationPrefsRouter } from "../../../../src/routes/room/notificationPrefs";
import { resetPrismaMock, prismaMock } from "../../../mocks/prisma";

vi.mock("../../../../src/middleware/requireAuth", () => ({
  default: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1" };
    next();
  },
}));

vi.mock("../../../../src/services/room/permissions", () => ({
  assertRoleAtLeast: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../src/db/prisma", () => ({
  prisma: prismaMock,
}));

import { assertRoleAtLeast } from "../../../../src/services/room/permissions";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/room/:roomId/notification-prefs", notificationPrefsRouter);
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

describe("room notificationPrefs routes", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("GET returns the user's notification pref", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue({
      notificationPref: "MENTIONS",
    } as any);

    const res = await supertest(createTestApp()).get(
      "/room/r1/notification-prefs/r1",
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      notificationPref: "MENTIONS",
    });
  });

  it("GET returns 403 when not a member", async () => {
    prismaMock.chatRoomMember.findUnique.mockResolvedValue(null);

    const res = await supertest(createTestApp()).get(
      "/room/r1/notification-prefs/r1",
    );

    expect(res.status).toBe(403);
  });

  it("PATCH updates the user's notification pref", async () => {
    prismaMock.chatRoomMember.update.mockResolvedValue({
      notificationPref: "MUTED",
    } as any);

    const res = await supertest(createTestApp())
      .patch("/room/r1/notification-prefs/r1")
      .send({ notificationPref: "MUTED" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      notificationPref: "MUTED",
    });
    expect(assertRoleAtLeast).toHaveBeenCalledWith("user-1", "r1", "MEMBER");
  });

  it("PATCH returns 400 on invalid input", async () => {
    const res = await supertest(createTestApp())
      .patch("/room/r1/notification-prefs/r1")
      .send({ notificationPref: "BANANA" });

    expect(res.status).toBe(400);
  });
});
