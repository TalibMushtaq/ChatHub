import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import callRouter from "../../../../src/routes/direct-chat/call";
import { resetPrismaMock } from "../../../mocks/prisma";

// Mock auth middleware so every request is authenticated.
vi.mock("../../../../src/middleware/requireAuth", () => ({
  default: (req: any, _res: any, next: any) => {
    req.user = {
      id: "user-1",
      username: "alice",
      displayName: "Alice",
      avatar: "https://example.com/avatar.jpg",
    };
    next();
  },
}));

// Mock the call service to control behavior at the route layer.
vi.mock("../../../../src/services/direct-chat/call", () => ({
  initiateDmCall: vi.fn(),
  acceptDmCall: vi.fn().mockResolvedValue({ sessionId: "sess1" }),
  declineDmCall: vi.fn().mockResolvedValue({ sessionId: "sess1" }),
  cancelDmCall: vi.fn().mockResolvedValue({ sessionId: "sess1" }),
  joinDmCall: vi.fn(),
  leaveDmCall: vi.fn(),
  getActiveDmCall: vi.fn(),
}));

vi.mock("../../../../src/middleware/socketAccess", () => ({
  assertDirectChatAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../src/lib/rateLimiter", () => ({
  createRateLimiter: vi.fn(() => vi.fn()),
  enforceRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../src/lib/validate", () => ({
  unwrapParsed: (result: any) => {
    if (!result.success) {
      const err = new Error(result.error?.message ?? "Validation failed");
      (err as any).statusCode = 400;
      throw err;
    }
    return result.data;
  },
}));

vi.mock("../../../../src/sockets/direct-chat", () => ({
  getDirectChatRoom: (id: string) => `directChat:${id}`,
}));

vi.mock("../../../../src/lib/livekit", () => ({
  getLiveKitRoomClient: vi.fn(),
}));

// Mock prisma for getCalleeId lookups.
vi.mock("../../../../db/prisma", () => ({
  prisma: {
    directChat: {
      findUnique: vi.fn(),
    },
  },
}));

import {
  initiateDmCall,
  acceptDmCall,
  declineDmCall,
  cancelDmCall,
  joinDmCall,
  leaveDmCall,
  getActiveDmCall,
} from "../../../../src/services/direct-chat/call";
import { prisma } from "../../../../db/prisma";
import { getLiveKitRoomClient } from "../../../../src/lib/livekit";

const prismaMock = vi.mocked(prisma);

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
  app.use("/dm", callRouter);
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

const app = createTestApp();
const req = supertest(app);

describe("DM call routes", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    vi.mocked(prismaMock.directChat.findUnique).mockResolvedValue({
      user1Id: "user-1",
      user2Id: "user-2",
    } as any);
    deleteRoom.mockClear();
    (getLiveKitRoomClient as any).mockReturnValue({ deleteRoom });
  });

  // ---------------------------------------------------------------------------
  // POST /:directChatId/call/initiate
  // ---------------------------------------------------------------------------
  describe("POST /:directChatId/call/initiate", () => {
    it("creates a call and emits dmCall:invited to the callee", async () => {
      vi.mocked(initiateDmCall).mockResolvedValue({
        sessionId: "sess1",
        token: "tok",
        livekitUrl: "ws://localhost:7880",
        roomName: "dm-call:sess1",
      });

      const res = await req
        .post("/dm/dc1/call/initiate")
        .send({ callType: "VIDEO" });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.sessionId).toBe("sess1");
      expect(initiateDmCall).toHaveBeenCalledWith("user-1", "dc1", "VIDEO");

      // Invite should go to the callee's user room, not the DM room.
      expect(ioSpy.to).toHaveBeenCalledWith("user:user-2");
      expect(emitSpy).toHaveBeenCalledWith("dmCall:invited", {
        directChatId: "dc1",
        sessionId: "sess1",
        callType: "VIDEO",
        caller: expect.objectContaining({ id: "user-1", username: "alice" }),
      });
    });

    it("rejects invalid callType", async () => {
      const res = await req
        .post("/dm/dc1/call/initiate")
        .send({ callType: "SCREEN" });

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /:directChatId/call/accept
  // ---------------------------------------------------------------------------
  describe("POST /:directChatId/call/accept", () => {
    it("accepts the call and emits dmCall:accepted + dmCall:dismiss", async () => {
      const res = await req.post("/dm/dc1/call/accept");

      expect(res.status).toBe(200);
      expect(acceptDmCall).toHaveBeenCalledWith("user-1", "dc1");

      // Accepted goes to the DM room.
      const acceptedCall = ioSpy.to.mock.calls.find(
        (c: any[]) => c[0] === "directChat:dc1",
      );
      expect(acceptedCall).toBeTruthy();

      // Dismiss goes to the callee's own user room (multi-device sync).
      expect(ioSpy.to).toHaveBeenCalledWith("user:user-1");
      expect(emitSpy).toHaveBeenCalledWith(
        "dmCall:dismiss",
        expect.objectContaining({ reason: "accepted" }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // POST /:directChatId/call/decline
  // ---------------------------------------------------------------------------
  describe("POST /:directChatId/call/decline", () => {
    it("declines the call and emits dismiss to both participants", async () => {
      const res = await req.post("/dm/dc1/call/decline");

      expect(res.status).toBe(200);
      expect(declineDmCall).toHaveBeenCalledWith(
        "user-1",
        "dc1",
        expect.anything(),
      );

      // Dismiss to both user rooms.
      const dismissCalls = emitSpy.mock.calls.filter(
        (c: any[]) => c[0] === "dmCall:dismiss",
      );
      expect(dismissCalls.length).toBeGreaterThanOrEqual(2);
      expect(dismissCalls.every((c: any[]) => c[1].reason === "declined")).toBe(
        true,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // POST /:directChatId/call/cancel
  // ---------------------------------------------------------------------------
  describe("POST /:directChatId/call/cancel", () => {
    it("cancels the call and emits dismiss to both participants", async () => {
      const res = await req.post("/dm/dc1/call/cancel");

      expect(res.status).toBe(200);
      expect(cancelDmCall).toHaveBeenCalledWith(
        "user-1",
        "dc1",
        expect.anything(),
      );

      const dismissCalls = emitSpy.mock.calls.filter(
        (c: any[]) => c[0] === "dmCall:dismiss",
      );
      expect(dismissCalls.length).toBeGreaterThanOrEqual(2);
      expect(
        dismissCalls.every((c: any[]) => c[1].reason === "cancelled"),
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /:directChatId/call/join
  // ---------------------------------------------------------------------------
  describe("POST /:directChatId/call/join", () => {
    it("joins the call and emits dmCall:participant.joined", async () => {
      vi.mocked(joinDmCall).mockResolvedValue({
        sessionId: "sess1",
        token: "tok",
        livekitUrl: "ws://localhost:7880",
        roomName: "dm-call:sess1",
      });

      const res = await req.post("/dm/dc1/call/join");

      expect(res.status).toBe(200);
      expect(joinDmCall).toHaveBeenCalledWith("user-1", "dc1");
      expect(emitSpy).toHaveBeenCalledWith(
        "dmCall:participant.joined",
        expect.objectContaining({
          directChatId: "dc1",
          userId: "user-1",
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // POST /:directChatId/call/leave
  // ---------------------------------------------------------------------------
  describe("POST /:directChatId/call/leave", () => {
    it("emits participant.left and ended with actual outcome when call ends", async () => {
      vi.mocked(leaveDmCall).mockResolvedValue({
        sessionId: "sess1",
        callEnded: true,
        outcome: "MISSED",
      });

      const res = await req.post("/dm/dc1/call/leave");

      expect(res.status).toBe(200);
      expect(emitSpy).toHaveBeenCalledWith(
        "dmCall:participant.left",
        expect.objectContaining({ userId: "user-1" }),
      );
      expect(emitSpy).toHaveBeenCalledWith(
        "dmCall:ended",
        expect.objectContaining({ outcome: "MISSED" }),
      );
      // Clients get the ended signal first; only then is the LiveKit room
      // deleted so they can disconnect gracefully.
      expect(deleteRoom).toHaveBeenCalledWith("dm-call:sess1");
    });

    it("emits only participant.left when call does not end", async () => {
      vi.mocked(leaveDmCall).mockResolvedValue({
        sessionId: "sess1",
        callEnded: false,
      });

      const res = await req.post("/dm/dc1/call/leave");

      expect(res.status).toBe(200);
      expect(emitSpy).toHaveBeenCalledWith(
        "dmCall:participant.left",
        expect.objectContaining({ userId: "user-1" }),
      );
      expect(emitSpy).not.toHaveBeenCalledWith(
        "dmCall:ended",
        expect.anything(),
      );
      expect(deleteRoom).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // GET /:directChatId/call
  // ---------------------------------------------------------------------------
  describe("GET /:directChatId/call", () => {
    it("returns the active call session", async () => {
      vi.mocked(getActiveDmCall).mockResolvedValue({
        id: "sess1",
        directChatId: "dc1",
        participants: [],
      } as any);

      const res = await req.get("/dm/dc1/call");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.session).toBeTruthy();
    });
  });
});
