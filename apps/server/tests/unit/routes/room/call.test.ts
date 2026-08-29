import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import callRouter from "../../../../src/routes/room/call";
import { resetPrismaMock } from "../../../mocks/prisma";

// Mock auth middleware so every request is authenticated.
vi.mock("../../../../src/middleware/requireAuth", () => ({
  default: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1" };
    next();
  },
}));

// Mock the call service to control behavior at the route layer.
vi.mock("../../../../src/services/room/call", () => ({
  getJoinToken: vi.fn(),
  leaveCall: vi
    .fn()
    .mockResolvedValue({ sessionId: "sess1", callEnded: false }),
  getActiveCall: vi.fn(),
  getActiveCallsForRoom: vi.fn(),
  moderatorAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../src/middleware/socketAccess", () => ({
  assertRoomAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../src/lib/livekit", () => ({
  getLiveKitRoomClient: vi.fn(),
}));

import {
  getJoinToken,
  getActiveCall,
  getActiveCallsForRoom,
  leaveCall,
} from "../../../../src/services/room/call";
import { getLiveKitRoomClient } from "../../../../src/lib/livekit";

const emitSpy = vi.fn();
const ioSpy = {
  to: vi.fn(() => ({ emit: emitSpy })),
};
const deleteRoom = vi.fn().mockResolvedValue(undefined);

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: Response, next: NextFunction) => {
    req.io = ioSpy;
    next();
  });
  app.use("/room", callRouter);
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

describe("room call routes", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    ioSpy.to.mockClear();
    emitSpy.mockClear();
    deleteRoom.mockClear();
    (getLiveKitRoomClient as any).mockReturnValue({ deleteRoom });
  });

  it("POST join-token returns token + livekit url + room name", async () => {
    (getJoinToken as any).mockResolvedValue({
      token: "tok",
      livekitUrl: "ws://lk",
      roomName: "channel:ch1",
    });

    const res = await supertest(createTestApp()).post(
      "/room/rooms/r1/channels/ch1/call/join-token",
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      token: "tok",
      livekitUrl: "ws://lk",
      roomName: "channel:ch1",
    });
    expect(getJoinToken).toHaveBeenCalledWith("user-1", "r1", "ch1");
  });

  it("POST leave emits call.participant.left", async () => {
    const res = await supertest(createTestApp()).post(
      "/room/rooms/r1/channels/ch1/call/leave",
    );

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(ioSpy.to).toHaveBeenCalledWith("room:r1");
    expect(emitSpy).toHaveBeenCalledWith("call.participant.left", {
      channelId: "ch1",
      userId: "user-1",
    });
  });

  it("GET call returns the active session", async () => {
    (getActiveCall as any).mockResolvedValue({
      id: "sess1",
      channelId: "ch1",
      startedAt: "2026-01-01",
      endedAt: null,
      participants: [],
    });

    const res = await supertest(createTestApp()).get(
      "/room/rooms/r1/channels/ch1/call",
    );

    expect(res.status).toBe(200);
    expect(res.body.session.id).toBe("sess1");
  });

  it("PATCH moderator with invalid action returns 400", async () => {
    const res = await supertest(createTestApp())
      .patch("/room/rooms/r1/channels/ch1/call/participants/u2")
      .send({ action: "banish" });

    expect(res.status).toBe(400);
  });

  it("PATCH moderator disconnect emits call.participant.kicked", async () => {
    const res = await supertest(createTestApp())
      .patch("/room/rooms/r1/channels/ch1/call/participants/u2")
      .send({ action: "disconnect" });

    expect(res.status).toBe(200);
    expect(emitSpy).toHaveBeenCalledWith("call.participant.kicked", {
      channelId: "ch1",
      userId: "u2",
      by: "user-1",
    });
  });

  it("PATCH moderator mute emits call.participant.muted", async () => {
    const res = await supertest(createTestApp())
      .patch("/room/rooms/r1/channels/ch1/call/participants/u2")
      .send({ action: "mute" });

    expect(res.status).toBe(200);
    expect(emitSpy).toHaveBeenCalledWith("call.participant.muted", {
      channelId: "ch1",
      userId: "u2",
      by: "user-1",
    });
  });

  it("POST join-token emits call.started when isNewSession is true", async () => {
    (getJoinToken as any).mockResolvedValue({
      token: "tok",
      livekitUrl: "ws://lk",
      roomName: "channel:ch1",
      sessionId: "sess-new",
      isNewSession: true,
    });

    const res = await supertest(createTestApp()).post(
      "/room/rooms/r1/channels/ch1/call/join-token",
    );

    expect(res.status).toBe(200);
    expect(ioSpy.to).toHaveBeenCalledWith("room:r1");
    expect(emitSpy).toHaveBeenCalledWith("call.started", {
      channelId: "ch1",
      sessionId: "sess-new",
    });
  });

  it("POST join-token does not emit call.started when isNewSession is false", async () => {
    (getJoinToken as any).mockResolvedValue({
      token: "tok",
      livekitUrl: "ws://lk",
      roomName: "channel:ch1",
      sessionId: "sess-existing",
      isNewSession: false,
    });

    await supertest(createTestApp()).post(
      "/room/rooms/r1/channels/ch1/call/join-token",
    );

    expect(emitSpy).not.toHaveBeenCalledWith("call.started", expect.anything());
  });

  it("POST leave emits call.ended when session ends", async () => {
    (leaveCall as any).mockResolvedValue({
      sessionId: "sess1",
      callEnded: true,
    });

    const res = await supertest(createTestApp()).post(
      "/room/rooms/r1/channels/ch1/call/leave",
    );

    expect(res.status).toBe(200);
    expect(emitSpy).toHaveBeenCalledWith("call.ended", {
      channelId: "ch1",
      sessionId: "sess1",
    });
    // Clients get the ended signal first; only then is the LiveKit room
    // deleted so they can disconnect gracefully.
    expect(deleteRoom).toHaveBeenCalledWith("channel:ch1");
  });

  it("POST leave does not emit call.ended when session remains active", async () => {
    (leaveCall as any).mockResolvedValue({
      sessionId: "sess1",
      callEnded: false,
    });

    await supertest(createTestApp()).post(
      "/room/rooms/r1/channels/ch1/call/leave",
    );

    expect(emitSpy).not.toHaveBeenCalledWith("call.ended", expect.anything());
    expect(deleteRoom).not.toHaveBeenCalled();
  });

  it("GET active calls returns sessions", async () => {
    (getActiveCallsForRoom as any).mockResolvedValue([
      {
        channelId: "ch1",
        sessionId: "sess1",
        participants: [{ userId: "u1", username: "user1" }],
      },
    ]);

    const res = await supertest(createTestApp()).get(
      "/room/rooms/r1/calls/active",
    );

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.calls).toHaveLength(1);
    expect(res.body.calls[0].sessionId).toBe("sess1");
  });
});
