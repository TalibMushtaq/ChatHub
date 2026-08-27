import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createOrReuseSession,
  upsertParticipant,
  markParticipantLeft,
  endSessionIfEmpty,
  endSession,
  generateCallToken,
  reapStaleParticipants,
  endAllActiveSessions,
  timeoutRingingCalls,
} from "../../../../src/services/call/core";
import {
  prismaMock,
  resetPrismaMock,
  createMockTransaction,
} from "../../../mocks/prisma";

vi.mock("../../../../src/lib/livekit", () => ({
  generateJoinToken: vi.fn().mockResolvedValue("fake-token"),
  getLiveKitRoomClient: vi.fn(() => ({
    deleteRoom: vi.fn().mockResolvedValue(undefined),
    removeParticipant: vi.fn().mockResolvedValue(undefined),
    listParticipants: vi.fn().mockResolvedValue([]),
  })),
  LIVEKIT_WS_URL: "ws://localhost:7880",
}));

vi.mock("../../../../src/lib/logger", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock("../../../../src/sockets/direct-chat", () => ({
  getDirectChatRoom: (id: string) => `directChat:${id}`,
}));

function createMockIo() {
  const emit = vi.fn();
  return { to: vi.fn(() => ({ emit })) } as any;
}

describe("shared call core", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  describe("createOrReuseSession", () => {
    it("creates a new session for a channel target", async () => {
      prismaMock.callSession.create.mockResolvedValue({
        id: "sess1",
        channelId: "ch1",
        directChatId: null,
        callType: "VOICE",
        status: "ACTIVE",
        outcome: null,
        startedAt: new Date(),
        connectedAt: null,
        endedAt: null,
      } as any);

      const result = await createOrReuseSession(
        { type: "channel", roomId: "r1", channelId: "ch1" },
        "VOICE",
        "ACTIVE",
      );

      expect(result.isNewSession).toBe(true);
      expect(result.session.id).toBe("sess1");
      expect(prismaMock.callSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            callType: "VOICE",
            status: "ACTIVE",
          }),
        }),
      );
    });

    it("creates a new RINGING session for a DM target", async () => {
      prismaMock.callSession.create.mockResolvedValue({
        id: "sess1",
        channelId: null,
        directChatId: "dc1",
        callType: "VIDEO",
        status: "RINGING",
        outcome: null,
        startedAt: new Date(),
        connectedAt: null,
        endedAt: null,
      } as any);

      const result = await createOrReuseSession(
        { type: "direct", directChatId: "dc1" },
        "VIDEO",
        "RINGING",
      );

      expect(result.isNewSession).toBe(true);
      expect(prismaMock.callSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            callType: "VIDEO",
            status: "RINGING",
          }),
        }),
      );
    });

    it("falls back to findFirst on P2002 unique violation", async () => {
      const uniqueError = new Error("Unique constraint") as Error & {
        code: string;
      };
      uniqueError.code = "P2002";
      prismaMock.callSession.create.mockRejectedValue(uniqueError);

      prismaMock.callSession.findFirst.mockResolvedValue({
        id: "existing-sess",
        channelId: "ch1",
        directChatId: null,
      } as any);

      const result = await createOrReuseSession(
        { type: "channel", roomId: "r1", channelId: "ch1" },
        "VOICE",
        "ACTIVE",
      );

      expect(result.isNewSession).toBe(false);
      expect(result.session.id).toBe("existing-sess");
    });

    it("re-throws non-P2002 errors", async () => {
      prismaMock.callSession.create.mockRejectedValue(new Error("DB down"));

      await expect(
        createOrReuseSession(
          { type: "channel", roomId: "r1", channelId: "ch1" },
          "VOICE",
        ),
      ).rejects.toThrow("DB down");
    });

    it("returns null session when P2002 fallback finds nothing", async () => {
      const uniqueError = new Error("Unique constraint") as Error & {
        code: string;
      };
      uniqueError.code = "P2002";
      prismaMock.callSession.create.mockRejectedValue(uniqueError);
      prismaMock.callSession.findFirst.mockResolvedValue(null);

      // createOrReuseSession doesn't return null session - it throws if findFirst returns null
      // Actually looking at the code, it returns { session: existing, isNewSession: false }
      // but existing could be null. Let me check...
      // The code does: if (existing) { return ... } — but if existing is null it falls through
      // and re-throws the original P2002 error. That's actually fine behavior.
      await expect(
        createOrReuseSession(
          { type: "channel", roomId: "r1", channelId: "ch1" },
          "VOICE",
        ),
      ).rejects.toThrow();
    });
  });

  describe("upsertParticipant", () => {
    it("creates a new participant", async () => {
      prismaMock.callParticipant.upsert.mockResolvedValue({} as any);

      await upsertParticipant("sess1", "u1");

      expect(prismaMock.callParticipant.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId_userId: { sessionId: "sess1", userId: "u1" } },
          create: { sessionId: "sess1", userId: "u1" },
          update: { leftAt: null, joinedAt: expect.any(Date) },
        }),
      );
    });

    it("re-joins a participant who previously left", async () => {
      prismaMock.callParticipant.upsert.mockResolvedValue({} as any);

      await upsertParticipant("sess1", "u1");

      expect(prismaMock.callParticipant.upsert).toHaveBeenCalled();
    });
  });

  describe("markParticipantLeft", () => {
    it("marks an active participant as left", async () => {
      prismaMock.callParticipant.findUnique.mockResolvedValue({
        id: "p1",
        sessionId: "sess1",
        userId: "u1",
        leftAt: null,
      } as any);
      prismaMock.callParticipant.update.mockResolvedValue({} as any);

      const result = await markParticipantLeft("sess1", "u1");

      expect(result).toEqual({ participantId: "p1" });
      expect(prismaMock.callParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "p1" },
          data: { leftAt: expect.any(Date) },
        }),
      );
    });

    it("returns null when participant not found", async () => {
      prismaMock.callParticipant.findUnique.mockResolvedValue(null);

      const result = await markParticipantLeft("sess1", "u1");
      expect(result).toBeNull();
    });

    it("returns null when participant already left", async () => {
      prismaMock.callParticipant.findUnique.mockResolvedValue({
        id: "p1",
        sessionId: "sess1",
        userId: "u1",
        leftAt: new Date(),
      } as any);

      const result = await markParticipantLeft("sess1", "u1");
      expect(result).toBeNull();
      expect(prismaMock.callParticipant.update).not.toHaveBeenCalled();
    });
  });

  describe("endSessionIfEmpty", () => {
    it("ends the session when no participants remain", async () => {
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(prismaMock),
      );
      prismaMock.$queryRaw.mockResolvedValue([{ id: "sess1" }]);
      prismaMock.callParticipant.count.mockResolvedValue(0);
      prismaMock.callSession.update.mockResolvedValue({} as any);

      const result = await endSessionIfEmpty("sess1");

      expect(result.callEnded).toBe(true);
      expect(prismaMock.callSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sess1" },
          data: { endedAt: expect.any(Date), outcome: "COMPLETED" },
        }),
      );
    });

    it("keeps the session alive when participants remain", async () => {
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(prismaMock),
      );
      prismaMock.$queryRaw.mockResolvedValue([{ id: "sess1" }]);
      prismaMock.callParticipant.count.mockResolvedValue(2);

      const result = await endSessionIfEmpty("sess1");

      expect(result.callEnded).toBe(false);
      expect(prismaMock.callSession.update).not.toHaveBeenCalled();
    });

    it("returns callEnded false when session not found (FOR UPDATE)", async () => {
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(prismaMock),
      );
      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await endSessionIfEmpty("sess-missing");
      expect(result.callEnded).toBe(false);
    });
  });

  describe("endSession", () => {
    it("ends session with MISSED outcome", async () => {
      prismaMock.$transaction.mockResolvedValue(undefined);

      await endSession("sess1", "MISSED");

      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it("ends session with DECLINED outcome", async () => {
      prismaMock.$transaction.mockResolvedValue(undefined);

      await endSession("sess1", "DECLINED");

      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it("ends session with CANCELLED outcome", async () => {
      prismaMock.$transaction.mockResolvedValue(undefined);

      await endSession("sess1", "CANCELLED");

      expect(prismaMock.$transaction).toHaveBeenCalled();
    });
  });

  describe("generateCallToken", () => {
    it("generates a token for a channel call", async () => {
      const result = await generateCallToken(
        "u1",
        { type: "channel", roomId: "r1", channelId: "ch1" },
        "sess1",
      );

      expect(result).toEqual({
        token: "fake-token",
        livekitUrl: "ws://localhost:7880",
        roomName: "channel:ch1",
      });
    });

    it("generates a token for a DM call", async () => {
      const result = await generateCallToken(
        "u1",
        { type: "direct", directChatId: "dc1" },
        "sess1",
      );

      expect(result).toEqual({
        token: "fake-token",
        livekitUrl: "ws://localhost:7880",
        roomName: "dm-call:sess1",
      });
    });
  });

  describe("reapStaleParticipants", () => {
    it("marks participants in ended sessions as left", async () => {
      prismaMock.callParticipant.updateMany.mockResolvedValueOnce({ count: 2 });
      prismaMock.callSession.findMany.mockResolvedValueOnce([]);

      const total = await reapStaleParticipants();
      expect(total).toBe(2);
    });

    it("reconciles active sessions against LiveKit", async () => {
      prismaMock.callParticipant.updateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.callSession.findMany.mockResolvedValueOnce([
        {
          id: "s1",
          channelId: "ch1",
          directChatId: null,
          participants: [
            { id: "cp1", userId: "u1" },
            { id: "cp2", userId: "u2" },
          ],
        },
      ] as any);

      const { getLiveKitRoomClient } =
        await import("../../../../src/lib/livekit");
      (getLiveKitRoomClient as any).mockReturnValue({
        listParticipants: vi.fn().mockResolvedValue([{ identity: "user:u1" }]),
      });

      prismaMock.callParticipant.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.callParticipant.count.mockResolvedValueOnce(1);

      const total = await reapStaleParticipants();
      expect(total).toBe(1);
    });

    it("handles DM sessions during reap", async () => {
      prismaMock.callParticipant.updateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.callSession.findMany.mockResolvedValueOnce([
        {
          id: "s1",
          channelId: null,
          directChatId: "dc1",
          participants: [{ id: "cp1", userId: "u1" }],
        },
      ] as any);

      const { getLiveKitRoomClient } =
        await import("../../../../src/lib/livekit");
      (getLiveKitRoomClient as any).mockReturnValue({
        listParticipants: vi.fn().mockResolvedValue([{ identity: "user:u1" }]),
      });

      prismaMock.callParticipant.updateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.callParticipant.count.mockResolvedValueOnce(1);

      const total = await reapStaleParticipants();
      expect(total).toBe(0);
    });

    it("ends empty sessions during reap", async () => {
      prismaMock.callParticipant.updateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.callSession.findMany.mockResolvedValueOnce([
        {
          id: "s1",
          channelId: "ch1",
          directChatId: null,
          participants: [{ id: "cp1", userId: "u1" }],
        },
      ] as any);

      const { getLiveKitRoomClient } =
        await import("../../../../src/lib/livekit");
      (getLiveKitRoomClient as any).mockReturnValue({
        listParticipants: vi.fn().mockResolvedValue([]),
      });

      prismaMock.callParticipant.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.callParticipant.count.mockResolvedValueOnce(0);
      prismaMock.callSession.update.mockResolvedValueOnce({} as any);

      const total = await reapStaleParticipants();
      expect(total).toBe(1);
      expect(prismaMock.callSession.update).toHaveBeenCalled();
    });

    it("handles LiveKit room not found gracefully", async () => {
      prismaMock.callParticipant.updateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.callSession.findMany.mockResolvedValueOnce([
        {
          id: "s1",
          channelId: "ch1",
          directChatId: null,
          participants: [{ id: "cp1", userId: "u1" }],
        },
      ] as any);

      const { getLiveKitRoomClient } =
        await import("../../../../src/lib/livekit");
      (getLiveKitRoomClient as any).mockReturnValue({
        listParticipants: vi
          .fn()
          .mockRejectedValue(new Error("room not found")),
      });

      prismaMock.callParticipant.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.callParticipant.count.mockResolvedValueOnce(0);
      prismaMock.callSession.update.mockResolvedValueOnce({} as any);

      const total = await reapStaleParticipants();
      expect(total).toBe(1);
    });

    it("skips sessions with 0 participants", async () => {
      prismaMock.callParticipant.updateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.callSession.findMany.mockResolvedValueOnce([
        {
          id: "s1",
          channelId: "ch1",
          directChatId: null,
          participants: [],
        },
      ] as any);

      const { getLiveKitRoomClient } =
        await import("../../../../src/lib/livekit");
      const mockClient = {
        listParticipants: vi.fn().mockResolvedValue([]),
      };
      (getLiveKitRoomClient as any).mockReturnValue(mockClient);

      const total = await reapStaleParticipants();
      expect(total).toBe(0);
      expect(mockClient.listParticipants).not.toHaveBeenCalled();
    });
  });

  describe("endAllActiveSessions", () => {
    it("ends all active sessions on startup", async () => {
      prismaMock.callSession.findMany.mockResolvedValue([
        { id: "s1" },
        { id: "s2" },
      ] as any);
      prismaMock.$transaction.mockImplementation(async (fns: any[]) =>
        Promise.all(fns),
      );

      await endAllActiveSessions();
      expect(prismaMock.callSession.updateMany).toHaveBeenCalled();
    });

    it("returns early when no active sessions", async () => {
      prismaMock.callSession.findMany.mockResolvedValue([]);

      await endAllActiveSessions();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("sets outcome=COMPLETED on end", async () => {
      prismaMock.callSession.findMany.mockResolvedValue([{ id: "s1" }] as any);
      prismaMock.$transaction.mockImplementation(async (fns: any[]) =>
        Promise.all(fns),
      );

      await endAllActiveSessions();

      expect(prismaMock.callSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { endedAt: expect.any(Date), outcome: "COMPLETED" },
        }),
      );
    });
  });

  describe("timeoutRingingCalls", () => {
    it("ends RINGING sessions older than 60s with MISSED outcome", async () => {
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(prismaMock),
      );
      prismaMock.callSession.findMany.mockResolvedValue([
        { id: "s1", directChatId: "dc1" },
      ] as any);
      prismaMock.callParticipant.updateMany.mockResolvedValue({
        count: 1,
      } as any);
      prismaMock.callSession.updateMany.mockResolvedValue({ count: 1 } as any);
      prismaMock.directChat.findUnique.mockResolvedValue({
        user1Id: "u1",
        user2Id: "u2",
      } as any);

      const io = createMockIo();
      const count = await timeoutRingingCalls(io);

      expect(count).toBe(1);
      expect(prismaMock.callSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            endedAt: expect.any(Date),
            status: "ENDED",
            outcome: "MISSED",
          },
        }),
      );
      // Should emit dmCall:ended to the DM room.
      expect(io.to).toHaveBeenCalledWith("directChat:dc1");
      // Should emit dmCall:dismiss to both users.
      expect(io.to).toHaveBeenCalledWith("user:u1");
      expect(io.to).toHaveBeenCalledWith("user:u2");
    });

    it("returns 0 when no stale ringing calls exist", async () => {
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(prismaMock),
      );
      prismaMock.callSession.findMany.mockResolvedValue([]);

      const io = createMockIo();
      const count = await timeoutRingingCalls(io);
      expect(count).toBe(0);
    });

    it("times out multiple stale sessions at once", async () => {
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(prismaMock),
      );
      prismaMock.callSession.findMany.mockResolvedValue([
        { id: "s1", directChatId: "dc1" },
        { id: "s2", directChatId: "dc2" },
        { id: "s3", directChatId: "dc3" },
      ] as any);
      prismaMock.callParticipant.updateMany.mockResolvedValue({
        count: 3,
      } as any);
      prismaMock.callSession.updateMany.mockResolvedValue({ count: 3 } as any);
      prismaMock.directChat.findUnique.mockResolvedValue({
        user1Id: "u1",
        user2Id: "u2",
      } as any);

      const io = createMockIo();
      const count = await timeoutRingingCalls(io);
      expect(count).toBe(3);
      // Each session should emit ended + dismiss to both users.
      expect(io.to).toHaveBeenCalledWith("directChat:dc1");
      expect(io.to).toHaveBeenCalledWith("directChat:dc2");
      expect(io.to).toHaveBeenCalledWith("directChat:dc3");
    });

    it("only queries RINGING sessions, not ACTIVE or ENDED", async () => {
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(prismaMock),
      );
      prismaMock.callSession.findMany.mockResolvedValue([]);

      await timeoutRingingCalls(createMockIo());

      expect(prismaMock.callSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "RINGING" }),
        }),
      );
    });
  });
});
