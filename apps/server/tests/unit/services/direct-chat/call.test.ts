import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  initiateDmCall,
  acceptDmCall,
  declineDmCall,
  cancelDmCall,
  joinDmCall,
  leaveDmCall,
  getActiveDmCall,
  handleLiveKitConnected,
  handleLiveKitDisconnected,
} from "../../../../src/services/direct-chat/call";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";
import { redis } from "../../../../src/lib/redis";

vi.mock("../../../../src/lib/livekit", () => ({
  getLiveKitRoomClient: vi.fn(() => ({
    deleteRoom: vi.fn().mockResolvedValue(undefined),
  })),
  generateJoinToken: vi.fn().mockResolvedValue("fake-token"),
  LIVEKIT_WS_URL: "ws://localhost:7880",
}));

vi.mock("../../../../src/lib/logger", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock("../../../../src/services/call/core", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../src/services/call/core")>();
  return {
    ...actual,
    createOrReuseSession: vi.fn(),
    upsertParticipant: vi.fn().mockResolvedValue(undefined),
    markParticipantLeft: vi.fn(),
    endSessionIfEmpty: vi.fn(),
    endSession: vi.fn().mockResolvedValue(undefined),
    generateCallToken: vi.fn(),
  };
});

vi.mock("../../../../src/services/idempotency", () => ({
  checkIdempotency: vi.fn(),
  storeIdempotency: vi.fn().mockResolvedValue(undefined),
}));

const core = vi.mocked(
  await import("../../../../src/services/call/core"),
);
const idempotency = vi.mocked(
  await import("../../../../src/services/idempotency"),
);

const activeSession = {
  id: "sess1",
  channelId: null,
  directChatId: "dc1",
  callType: "VOICE",
  status: "RINGING",
  outcome: null,
  startedAt: new Date(),
  connectedAt: null,
  endedAt: null,
} as const;

const activeSessionWithType = {
  ...activeSession,
  callType: "VIDEO",
} as const;

describe("DM call service", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    vi.mocked(redis.get).mockResolvedValue(null as never);
    vi.mocked(redis.set).mockResolvedValue("OK" as never);
    vi.mocked(redis.del).mockResolvedValue(1 as never);
  });

  describe("initiateDmCall", () => {
    it("creates a RINGING session and returns a token", async () => {
      core.createOrReuseSession.mockResolvedValue({
        session: { id: "sess1", channelId: null, directChatId: "dc1" },
        isNewSession: true,
      });
      core.generateCallToken.mockResolvedValue({
        token: "tok",
        livekitUrl: "ws://lk",
        roomName: "dm-call:sess1",
      });

      const result = await initiateDmCall("u1", "dc1", "VOICE");

      expect(result).toEqual({
        sessionId: "sess1",
        token: "tok",
        livekitUrl: "ws://lk",
        roomName: "dm-call:sess1",
      });
      expect(core.createOrReuseSession).toHaveBeenCalledWith(
        { type: "direct", directChatId: "dc1" },
        "VOICE",
        "RINGING",
      );
      expect(core.upsertParticipant).toHaveBeenCalledWith("sess1", "u1");
      expect(core.generateCallToken).toHaveBeenCalledWith(
        "u1",
        { type: "direct", directChatId: "dc1" },
        "sess1",
      );
    });

    it("supports VIDEO calls", async () => {
      core.createOrReuseSession.mockResolvedValue({
        session: { id: "sess1", channelId: null, directChatId: "dc1" },
        isNewSession: false,
      });
      core.generateCallToken.mockResolvedValue({
        token: "tok",
        livekitUrl: "ws://lk",
        roomName: "dm-call:sess1",
      });

      await initiateDmCall("u1", "dc1", "VIDEO");

      expect(core.createOrReuseSession).toHaveBeenCalledWith(
        { type: "direct", directChatId: "dc1" },
        "VIDEO",
        "RINGING",
      );
    });
  });

  describe("acceptDmCall", () => {
    it("returns the session id for a RINGING call", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(activeSession as any);

      const result = await acceptDmCall("u2", "dc1");

      expect(result).toEqual({ sessionId: "sess1" });
      expect(prismaMock.callSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { directChatId: "dc1", status: "RINGING", endedAt: null },
        }),
      );
    });

    it("throws NO_ACTIVE_CALL when no RINGING session exists", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(null);

      await expect(acceptDmCall("u2", "dc1")).rejects.toMatchObject({
        statusCode: 404,
        code: "NO_ACTIVE_CALL",
      });
    });
  });

  describe("declineDmCall", () => {
    it("ends the session with DECLINED and creates history message", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(
        activeSessionWithType as any,
      );
      idempotency.checkIdempotency.mockResolvedValue(null);
      prismaMock.callSession.findUnique.mockResolvedValue({
        id: "sess1",
        connectedAt: null,
        endedAt: null,
        startedAt: new Date(),
      } as any);
      prismaMock.message.create.mockResolvedValue({ id: "msg1" } as any);

      const result = await declineDmCall("u2", "dc1");

      expect(result).toEqual({ sessionId: "sess1" });
      expect(core.endSession).toHaveBeenCalledWith("sess1", "DECLINED");
      expect(prismaMock.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            senderId: "system",
            directChatId: "dc1",
            messageType: "SYSTEM",
            metadata: expect.objectContaining({
              kind: "call",
              callSessionId: "sess1",
              callType: "VIDEO",
              outcome: "DECLINED",
            }),
          }),
        }),
      );
    });

    it("throws NO_ACTIVE_CALL when no RINGING session", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(null);

      await expect(declineDmCall("u2", "dc1")).rejects.toMatchObject({
        statusCode: 404,
        code: "NO_ACTIVE_CALL",
      });
    });
  });

  describe("cancelDmCall", () => {
    it("ends the session with CANCELLED and creates history message", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(
        activeSession as any,
      );
      idempotency.checkIdempotency.mockResolvedValue(null);
      prismaMock.callSession.findUnique.mockResolvedValue({
        id: "sess1",
        connectedAt: null,
        endedAt: null,
        startedAt: new Date(),
      } as any);
      prismaMock.message.create.mockResolvedValue({ id: "msg1" } as any);

      const result = await cancelDmCall("u1", "dc1");

      expect(result).toEqual({ sessionId: "sess1" });
      expect(core.endSession).toHaveBeenCalledWith("sess1", "CANCELLED");
      expect(prismaMock.message.create).toHaveBeenCalled();
    });

    it("throws NO_ACTIVE_CALL when no RINGING session", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(null);

      await expect(cancelDmCall("u1", "dc1")).rejects.toMatchObject({
        statusCode: 404,
        code: "NO_ACTIVE_CALL",
      });
    });
  });

  describe("joinDmCall", () => {
    it("upserts participant and returns a token", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(
        activeSession as any,
      );
      core.generateCallToken.mockResolvedValue({
        token: "tok",
        livekitUrl: "ws://lk",
        roomName: "dm-call:sess1",
      });

      const result = await joinDmCall("u2", "dc1");

      expect(result).toEqual({
        sessionId: "sess1",
        token: "tok",
        livekitUrl: "ws://lk",
        roomName: "dm-call:sess1",
      });
      expect(core.upsertParticipant).toHaveBeenCalledWith("sess1", "u2");
      expect(prismaMock.callSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            directChatId: "dc1",
            status: { in: ["RINGING", "ACTIVE"] },
            endedAt: null,
          },
        }),
      );
    });

    it("throws NO_ACTIVE_CALL when session is not joinable", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(null);

      await expect(joinDmCall("u2", "dc1")).rejects.toMatchObject({
        statusCode: 404,
        code: "NO_ACTIVE_CALL",
      });
    });
  });

  describe("leaveDmCall", () => {
    it("returns null when no active session exists", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(null);

      const result = await leaveDmCall("u1", "dc1");
      expect(result).toBeNull();
    });

    it("returns null when the user was not a participant", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(activeSession as any);
      core.markParticipantLeft.mockResolvedValue(null);

      const result = await leaveDmCall("u1", "dc1");
      expect(result).toBeNull();
    });

    it("ends the session with MISSED outcome when it was never connected", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(activeSession as any);
      core.markParticipantLeft.mockResolvedValue({ participantId: "p1" });
      core.endSessionIfEmpty.mockResolvedValue({ callEnded: true });
      prismaMock.callSession.update.mockResolvedValue({} as any);
      idempotency.checkIdempotency.mockResolvedValue(null);
      prismaMock.callSession.findUnique.mockResolvedValue({
        id: "sess1",
        connectedAt: null,
        endedAt: new Date(),
        startedAt: new Date(),
      } as any);
      prismaMock.message.create.mockResolvedValue({ id: "msg1" } as any);

      const result = await leaveDmCall("u1", "dc1");

      expect(result).toEqual({ sessionId: "sess1", callEnded: true });
      expect(prismaMock.callSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sess1" },
          data: { status: "ENDED", outcome: "MISSED" },
        }),
      );
      expect(redis.del).toHaveBeenCalledWith("dmcall:connected:sess1:u1");
    });

    it("ends the session with COMPLETED outcome when it was connected", async () => {
      const connectedSession = {
        ...activeSession,
        connectedAt: new Date("2024-01-01T00:00:00Z"),
        callType: "VOICE",
      } as const;
      prismaMock.callSession.findFirst.mockResolvedValue(
        connectedSession as any,
      );
      core.markParticipantLeft.mockResolvedValue({ participantId: "p1" });
      core.endSessionIfEmpty.mockResolvedValue({ callEnded: true });
      prismaMock.callSession.update.mockResolvedValue({} as any);
      idempotency.checkIdempotency.mockResolvedValue(null);
      prismaMock.callSession.findUnique.mockResolvedValue({
        id: "sess1",
        connectedAt: new Date("2024-01-01T00:00:00Z"),
        endedAt: new Date("2024-01-01T00:05:32Z"),
        startedAt: new Date("2024-01-01T00:00:00Z"),
      } as any);
      prismaMock.message.create.mockResolvedValue({ id: "msg1" } as any);

      const result = await leaveDmCall("u1", "dc1");

      expect(result).toEqual({ sessionId: "sess1", callEnded: true });
      expect(prismaMock.callSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "ENDED", outcome: "COMPLETED" },
        }),
      );
      // 5:32 duration → "Voice call · 5:32"
      expect(prismaMock.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            content: "Voice call \u00b7 5:32",
            metadata: expect.objectContaining({ durationSeconds: 332 }),
          }),
        }),
      );
    });

    it("does not end the session when other participants remain", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(activeSession as any);
      core.markParticipantLeft.mockResolvedValue({ participantId: "p1" });
      core.endSessionIfEmpty.mockResolvedValue({ callEnded: false });

      const result = await leaveDmCall("u1", "dc1");

      expect(result).toEqual({ sessionId: "sess1", callEnded: false });
      expect(prismaMock.callSession.update).not.toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalledWith("dmcall:connected:sess1:u1");
    });

    it("tolerates LiveKit room deletion failure", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(activeSession as any);
      core.markParticipantLeft.mockResolvedValue({ participantId: "p1" });
      core.endSessionIfEmpty.mockResolvedValue({ callEnded: true });
      prismaMock.callSession.update.mockResolvedValue({} as any);
      idempotency.checkIdempotency.mockResolvedValue(null);
      prismaMock.callSession.findUnique.mockResolvedValue({
        id: "sess1",
        connectedAt: null,
        endedAt: new Date(),
        startedAt: new Date(),
      } as any);
      prismaMock.message.create.mockResolvedValue({ id: "msg1" } as any);

      const { getLiveKitRoomClient } =
        await import("../../../../src/lib/livekit");
      (getLiveKitRoomClient as any).mockReturnValue({
        deleteRoom: vi.fn().mockRejectedValue(new Error("room gone")),
      });

      const result = await leaveDmCall("u1", "dc1");
      expect(result).toEqual({ sessionId: "sess1", callEnded: true });
    });
  });

  describe("getActiveDmCall", () => {
    it("returns the active session with participants", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue({
        id: "sess1",
        directChatId: "dc1",
        participants: [{ userId: "u1" }],
      } as any);

      const result = await getActiveDmCall("dc1");
      expect(result?.id).toBe("sess1");
    });

    it("returns null when no active call", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(null);
      const result = await getActiveDmCall("dc1");
      expect(result).toBeNull();
    });
  });

  describe("handleLiveKitConnected", () => {
    it("returns connected:false when session is not a DM call", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue({
        id: "sess1",
        directChatId: null,
        status: "RINGING",
      } as any);

      const result = await handleLiveKitConnected("u1", "sess1");
      expect(result).toEqual({ connected: false });
    });

    it("returns connected:false when session not found", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(null);

      const result = await handleLiveKitConnected("u1", "sess1");
      expect(result).toEqual({ connected: false });
    });

    it("returns connected:false when direct chat not found", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue({
        id: "sess1",
        directChatId: "dc1",
        status: "RINGING",
      } as any);
      prismaMock.directChat.findUnique.mockResolvedValue(null);

      const result = await handleLiveKitConnected("u1", "sess1");
      expect(result).toEqual({ connected: false });
      expect(redis.set).toHaveBeenCalledWith("dmcall:connected:sess1:u1", "1", {
        EX: 300,
      });
    });

    it("transitions to ACTIVE when both participants are connected", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue({
        id: "sess1",
        directChatId: "dc1",
        status: "RINGING",
      } as any);
      prismaMock.directChat.findUnique.mockResolvedValue({
        id: "dc1",
        user1Id: "u1",
        user2Id: "u2",
      } as any);
      vi.mocked(redis.get).mockResolvedValue("1" as never);
      prismaMock.callSession.update.mockResolvedValue({} as any);

      const result = await handleLiveKitConnected("u1", "sess1");

      expect(result).toEqual({ connected: true });
      expect(prismaMock.callSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sess1" },
          data: { status: "ACTIVE", connectedAt: expect.any(Date) },
        }),
      );
    });

    it("does not transition when only one participant is connected", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue({
        id: "sess1",
        directChatId: "dc1",
        status: "RINGING",
      } as any);
      prismaMock.directChat.findUnique.mockResolvedValue({
        id: "dc1",
        user1Id: "u1",
        user2Id: "u2",
      } as any);
      vi.mocked(redis.get).mockImplementation(async (key: string) =>
        key.endsWith(":u1") ? ("1" as never) : (null as never),
      );

      const result = await handleLiveKitConnected("u1", "sess1");

      expect(result).toEqual({ connected: false });
      expect(prismaMock.callSession.update).not.toHaveBeenCalled();
    });

    it("does not re-transition an already ACTIVE session", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue({
        id: "sess1",
        directChatId: "dc1",
        status: "ACTIVE",
      } as any);
      prismaMock.directChat.findUnique.mockResolvedValue({
        id: "dc1",
        user1Id: "u1",
        user2Id: "u2",
      } as any);
      vi.mocked(redis.get).mockResolvedValue("1" as never);

      const result = await handleLiveKitConnected("u1", "sess1");

      expect(result).toEqual({ connected: false });
      expect(prismaMock.callSession.update).not.toHaveBeenCalled();
    });
  });

  describe("handleLiveKitDisconnected", () => {
    it("removes the connected key from Redis", async () => {
      await handleLiveKitDisconnected("u1", "sess1");

      expect(redis.del).toHaveBeenCalledWith("dmcall:connected:sess1:u1");
    });

    it("tolerates Redis failures", async () => {
      vi.mocked(redis.del).mockRejectedValue(new Error("redis down") as never);

      await expect(
        handleLiveKitDisconnected("u1", "sess1"),
      ).resolves.toBeUndefined();
    });
  });

  describe("call-history system messages", () => {
    it("skips creation when the idempotency key already exists", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(
        activeSessionWithType as any,
      );
      idempotency.checkIdempotency.mockResolvedValue("existing-msg");

      await declineDmCall("u2", "dc1");

      expect(prismaMock.message.create).not.toHaveBeenCalled();
    });

    it("builds content for a missed call", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(
        activeSession as any,
      );
      idempotency.checkIdempotency.mockResolvedValue(null);
      prismaMock.callSession.findUnique.mockResolvedValue({
        id: "sess1",
        connectedAt: null,
        endedAt: new Date(),
        startedAt: new Date(),
      } as any);
      prismaMock.message.create.mockResolvedValue({ id: "msg1" } as any);

      await cancelDmCall("u1", "dc1");
      // cancelDmCall → CANCELLED path; separate MISSED path tested below.
    });

    it("creates a MISSED call-history message", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(activeSession as any);
      idempotency.checkIdempotency.mockResolvedValue(null);
      prismaMock.callSession.findUnique.mockResolvedValue({
        id: "sess1",
        connectedAt: null,
        endedAt: new Date(),
        startedAt: new Date(),
      } as any);
      prismaMock.message.create.mockResolvedValue({ id: "msg1" } as any);

      // leaveDmCall derives MISSED when never connected.
      core.markParticipantLeft.mockResolvedValue({ participantId: "p1" });
      core.endSessionIfEmpty.mockResolvedValue({ callEnded: true });
      prismaMock.callSession.update.mockResolvedValue({} as any);

      await leaveDmCall("u1", "dc1");

      const createCall = prismaMock.message.create.mock.calls[0]![0] as {
        data: { content: string; metadata: { outcome: string } };
      };
      expect(createCall.data.content).toBe("Missed voice call");
      expect(createCall.data.metadata.outcome).toBe("MISSED");
    });

    it("creates a DECLINED call-history message", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(
        activeSessionWithType as any,
      );
      idempotency.checkIdempotency.mockResolvedValue(null);
      prismaMock.callSession.findUnique.mockResolvedValue({
        id: "sess1",
        connectedAt: null,
        endedAt: null,
        startedAt: new Date(),
      } as any);
      prismaMock.message.create.mockResolvedValue({ id: "msg1" } as any);

      await declineDmCall("u2", "dc1");

      const createCall = prismaMock.message.create.mock.calls[0]![0] as {
        data: { content: string };
      };
      expect(createCall.data.content).toBe("Declined video call");
    });

    it("creates a CANCELLED call-history message", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(
        activeSessionWithType as any,
      );
      idempotency.checkIdempotency.mockResolvedValue(null);
      prismaMock.callSession.findUnique.mockResolvedValue({
        id: "sess1",
        connectedAt: null,
        endedAt: null,
        startedAt: new Date(),
      } as any);
      prismaMock.message.create.mockResolvedValue({ id: "msg1" } as any);

      await cancelDmCall("u1", "dc1");

      const createCall = prismaMock.message.create.mock.calls[0]![0] as {
        data: { content: string };
      };
      expect(createCall.data.content).toBe("Video call cancelled");
    });

    it("builds a plain label when duration is unknown for COMPLETED", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(activeSession as any);
      core.markParticipantLeft.mockResolvedValue({ participantId: "p1" });
      core.endSessionIfEmpty.mockResolvedValue({ callEnded: true });
      prismaMock.callSession.update.mockResolvedValue({} as any);
      idempotency.checkIdempotency.mockResolvedValue(null);
      prismaMock.callSession.findUnique.mockResolvedValue({
        id: "sess1",
        connectedAt: null,
        endedAt: null,
        startedAt: new Date(),
      } as any);
      prismaMock.message.create.mockResolvedValue({ id: "msg1" } as any);

      // connectedAt is set → COMPLETED outcome, but findUnique has no endedAt.
      const connectedSession = {
        ...activeSession,
        connectedAt: new Date("2024-01-01T00:00:00Z"),
      } as const;
      prismaMock.callSession.findFirst.mockResolvedValue(
        connectedSession as any,
      );

      await leaveDmCall("u1", "dc1");

      const createCall = prismaMock.message.create.mock.calls[0]![0] as {
        data: { content: string };
      };
      expect(createCall.data.content).toBe("Voice call");
    });
  });
});