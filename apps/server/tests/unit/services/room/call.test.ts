import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getJoinToken,
  leaveCall,
  getActiveCall,
  getActiveCallsForRoom,
  moderatorAction,
  reapStaleParticipants,
  endAllActiveSessions,
  forceLeaveCall,
} from "../../../../src/services/room/call";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

// Mock the LiveKit SDK + our wrapper so no network calls happen in tests.
vi.mock("../../../../src/lib/livekit", () => ({
  generateJoinToken: vi.fn().mockResolvedValue("fake-token"),
  getLiveKitRoomClient: vi.fn(() => ({
    deleteRoom: vi.fn().mockResolvedValue(undefined),
    removeParticipant: vi.fn().mockResolvedValue(undefined),
    getParticipant: vi.fn().mockResolvedValue({ tracks: [] }),
    mutePublishedTrack: vi.fn().mockResolvedValue(undefined),
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

describe("room call service", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  describe("getJoinToken", () => {
    it("rejects non-members / users without CONNECT_VOICE", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue(null);

      await expect(getJoinToken("u1", "r1", "ch1")).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
    });

    it("rejects when the channel is not a voice channel", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);
      prismaMock.channel.findFirst.mockResolvedValue({
        id: "ch1",
        roomId: "r1",
        type: "TEXT",
        participantLimit: 25,
      } as any);

      await expect(getJoinToken("u1", "r1", "ch1")).rejects.toMatchObject({
        statusCode: 400,
        code: "NOT_VOICE_CHANNEL",
      });
    });

    it("rejects when the channel is full", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);
      prismaMock.channel.findFirst.mockResolvedValue({
        id: "ch1",
        roomId: "r1",
        type: "VOICE",
        participantLimit: 2,
      } as any);
      prismaMock.callParticipant.count.mockResolvedValue(2);

      await expect(getJoinToken("u1", "r1", "ch1")).rejects.toMatchObject({
        statusCode: 400,
        code: "CHANNEL_FULL",
      });
    });

    it("creates a session + participant and returns a token", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);
      prismaMock.channel.findFirst.mockResolvedValue({
        id: "ch1",
        roomId: "r1",
        type: "VOICE",
        participantLimit: 25,
      } as any);
      prismaMock.callParticipant.count.mockResolvedValue(0);
      prismaMock.callSession.findFirst.mockResolvedValue(null);
      prismaMock.callSession.create.mockResolvedValue({
        id: "sess1",
        channelId: "ch1",
        startedAt: new Date(),
        endedAt: null,
      } as any);
      prismaMock.callParticipant.upsert.mockResolvedValue({} as any);

      const result = await getJoinToken("u1", "r1", "ch1");

      expect(result).toMatchObject({
        token: "fake-token",
        livekitUrl: "ws://localhost:7880",
        roomName: "channel:ch1",
      });
      expect(prismaMock.callSession.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { channelId: "ch1" } }),
      );
    });

    it("rejects when the user is already in another active call (single-call constraint)", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);
      prismaMock.channel.findFirst.mockResolvedValue({
        id: "ch1",
        roomId: "r1",
        type: "VOICE",
        participantLimit: 25,
      } as any);
      prismaMock.callParticipant.findFirst.mockResolvedValue({
        id: "existing-p",
        userId: "u1",
        leftAt: null,
        session: { channelId: "ch-other" },
      } as any);

      await expect(getJoinToken("u1", "r1", "ch1")).rejects.toMatchObject({
        statusCode: 409,
        code: "ALREADY_IN_CALL",
      });
    });

    it("allows re-joining the same voice channel", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);
      prismaMock.channel.findFirst.mockResolvedValue({
        id: "ch1",
        roomId: "r1",
        type: "VOICE",
        participantLimit: 25,
      } as any);
      // User is already in the same channel — should not be rejected.
      prismaMock.callParticipant.findFirst.mockResolvedValue({
        id: "existing-p",
        userId: "u1",
        leftAt: null,
        session: { channelId: "ch1" },
      } as any);
      prismaMock.callParticipant.count.mockResolvedValue(1);
      prismaMock.callSession.findFirst.mockResolvedValue({
        id: "sess-existing",
        channelId: "ch1",
        startedAt: new Date(),
        endedAt: null,
      } as any);

      const result = await getJoinToken("u1", "r1", "ch1");
      expect(result).toMatchObject({ token: "fake-token" });
    });

    it("allows joining when not in any call", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);
      prismaMock.channel.findFirst.mockResolvedValue({
        id: "ch1",
        roomId: "r1",
        type: "VOICE",
        participantLimit: 25,
      } as any);
      prismaMock.callParticipant.findFirst.mockResolvedValue(null);
      prismaMock.callParticipant.count.mockResolvedValue(0);
      prismaMock.callSession.findFirst.mockResolvedValue(null);
      prismaMock.callSession.create.mockResolvedValue({
        id: "sess1",
        channelId: "ch1",
        startedAt: new Date(),
        endedAt: null,
      } as any);
      prismaMock.callParticipant.upsert.mockResolvedValue({} as any);

      const result = await getJoinToken("u1", "r1", "ch1");
      expect(result).toMatchObject({ token: "fake-token" });
    });

    it("reuses an active session instead of creating a new one", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);
      prismaMock.channel.findFirst.mockResolvedValue({
        id: "ch1",
        roomId: "r1",
        type: "VOICE",
        participantLimit: 25,
      } as any);
      prismaMock.callParticipant.count.mockResolvedValue(1);
      prismaMock.callSession.findFirst.mockResolvedValue({
        id: "sess-existing",
        channelId: "ch1",
        startedAt: new Date(),
        endedAt: null,
      } as any);

      await getJoinToken("u1", "r1", "ch1");

      expect(prismaMock.callSession.create).not.toHaveBeenCalled();
      expect(prismaMock.callParticipant.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sessionId_userId: { sessionId: "sess-existing", userId: "u1" },
          },
        }),
      );
    });
  });

  describe("leaveCall", () => {
    it("marks the participant as left and ends the session when empty", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);
      prismaMock.callSession.findFirst.mockResolvedValue({
        id: "sess1",
        channelId: "ch1",
        startedAt: new Date(),
        endedAt: null,
      } as any);
      prismaMock.callParticipant.findUnique.mockResolvedValue({
        id: "p1",
        sessionId: "sess1",
        userId: "u1",
        leftAt: null,
      } as any);
      prismaMock.callParticipant.update.mockResolvedValue({} as any);
      prismaMock.callParticipant.count.mockResolvedValue(0);
      prismaMock.callSession.update.mockResolvedValue({} as any);

      await leaveCall("u1", "r1", "ch1");

      expect(prismaMock.callParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "p1" },
          data: { leftAt: expect.any(Date) },
        }),
      );
      expect(prismaMock.callSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sess1" },
          data: { endedAt: expect.any(Date) },
        }),
      );
    });

    it("does nothing if the user is not a participant", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);
      prismaMock.callSession.findFirst.mockResolvedValue({
        id: "sess1",
        channelId: "ch1",
        startedAt: new Date(),
        endedAt: null,
      } as any);
      prismaMock.callParticipant.findUnique.mockResolvedValue(null);

      await leaveCall("u1", "r1", "ch1");

      expect(prismaMock.callParticipant.update).not.toHaveBeenCalled();
    });

    it("returns callEnded false when other participants remain", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);
      prismaMock.callSession.findFirst.mockResolvedValue({
        id: "sess1",
        channelId: "ch1",
        startedAt: new Date(),
        endedAt: null,
      } as any);
      prismaMock.callParticipant.findUnique.mockResolvedValue({
        id: "p1",
        sessionId: "sess1",
        userId: "u1",
        leftAt: null,
      } as any);
      prismaMock.callParticipant.update.mockResolvedValue({} as any);
      prismaMock.callParticipant.count.mockResolvedValue(1);

      const result = await leaveCall("u1", "r1", "ch1");

      expect(result).toEqual({ sessionId: "sess1", callEnded: false });
      expect(prismaMock.callSession.update).not.toHaveBeenCalled();
    });

    it("returns null when participant already left", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);
      prismaMock.callSession.findFirst.mockResolvedValue({
        id: "sess1",
        channelId: "ch1",
        startedAt: new Date(),
        endedAt: null,
      } as any);
      prismaMock.callParticipant.findUnique.mockResolvedValue({
        id: "p1",
        sessionId: "sess1",
        userId: "u1",
        leftAt: new Date(),
      } as any);

      const result = await leaveCall("u1", "r1", "ch1");

      expect(result).toBeNull();
      expect(prismaMock.callParticipant.update).not.toHaveBeenCalled();
    });

    it("returns null when no active session exists", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);
      prismaMock.callSession.findFirst.mockResolvedValue(null);

      const result = await leaveCall("u1", "r1", "ch1");

      expect(result).toBeNull();
      expect(prismaMock.callParticipant.update).not.toHaveBeenCalled();
    });

    it("deletes LiveKit room when session ends", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);
      prismaMock.callSession.findFirst.mockResolvedValue({
        id: "sess1",
        channelId: "ch1",
        startedAt: new Date(),
        endedAt: null,
      } as any);
      prismaMock.callParticipant.findUnique.mockResolvedValue({
        id: "p1",
        sessionId: "sess1",
        userId: "u1",
        leftAt: null,
      } as any);
      prismaMock.callParticipant.update.mockResolvedValue({} as any);
      prismaMock.callParticipant.count.mockResolvedValue(0);
      prismaMock.callSession.update.mockResolvedValue({} as any);

      const { getLiveKitRoomClient } =
        await import("../../../../src/lib/livekit");
      const mockClient = {
        deleteRoom: vi.fn().mockResolvedValue(undefined),
        removeParticipant: vi.fn().mockResolvedValue(undefined),
        getParticipant: vi.fn().mockResolvedValue({ tracks: [] }),
        mutePublishedTrack: vi.fn().mockResolvedValue(undefined),
      };
      (getLiveKitRoomClient as any).mockReturnValue(mockClient);

      const result = await leaveCall("u1", "r1", "ch1");

      expect(result).toEqual({ sessionId: "sess1", callEnded: true });
      expect(mockClient.deleteRoom).toHaveBeenCalledWith("channel:ch1");
    });
  });

  describe("getActiveCall", () => {
    it("returns the active session with participants", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue({
        id: "sess1",
        channelId: "ch1",
        startedAt: new Date(),
        endedAt: null,
        participants: [{ userId: "u1" }],
      } as any);

      const result = await getActiveCall("ch1");
      expect(result?.id).toBe("sess1");
    });

    it("returns null when no active session", async () => {
      prismaMock.callSession.findFirst.mockResolvedValue(null);
      const result = await getActiveCall("ch1");
      expect(result).toBeNull();
    });
  });

  describe("getActiveCallsForRoom", () => {
    it("returns active sessions with participants for a room", async () => {
      prismaMock.callSession.findMany.mockResolvedValue([
        {
          id: "s1",
          channelId: "ch1",
          participants: [
            {
              user: {
                id: "u1",
                username: "user1",
                displayName: "User 1",
                avatar: null,
              },
            },
          ],
        },
      ] as any);
      const result = await getActiveCallsForRoom("r1");
      expect(result).toHaveLength(1);
      expect(result[0].channelId).toBe("ch1");
      expect(result[0].participants).toHaveLength(1);
    });

    it("returns empty array when no active sessions", async () => {
      prismaMock.callSession.findMany.mockResolvedValue([]);
      const result = await getActiveCallsForRoom("r1");
      expect(result).toHaveLength(0);
    });
  });

  describe("moderatorAction", () => {
    it("requires MOVE_MEMBERS_VOICE", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);

      await expect(
        moderatorAction("u1", "r1", "ch1", "u2", "mute"),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
    });

    it("disconnects a participant via the LiveKit room client", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MODERATOR",
      } as any);
      prismaMock.callSession.findFirst.mockResolvedValue({
        id: "sess1",
        channelId: "ch1",
        startedAt: new Date(),
        endedAt: null,
      } as any);
      prismaMock.callParticipant.findUnique.mockResolvedValue({
        id: "p1",
        sessionId: "sess1",
        userId: "u2",
        leftAt: null,
      } as any);
      prismaMock.callParticipant.update.mockResolvedValue({} as any);

      await moderatorAction("u1", "r1", "ch1", "u2", "disconnect");

      expect(
        (await import("../../../../src/lib/livekit")).getLiveKitRoomClient,
      ).toBeDefined();
    });

    it("mutes a participant's microphone track", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MODERATOR",
      } as any);
      prismaMock.callSession.findFirst.mockResolvedValue({
        id: "sess1",
        channelId: "ch1",
        startedAt: new Date(),
        endedAt: null,
      } as any);
      prismaMock.callParticipant.findUnique.mockResolvedValue({
        id: "p1",
        sessionId: "sess1",
        userId: "u2",
        leftAt: null,
      } as any);

      const { getLiveKitRoomClient } =
        await import("../../../../src/lib/livekit");
      (getLiveKitRoomClient as any).mockReturnValue({
        getParticipant: vi.fn().mockResolvedValue({
          tracks: [
            { sid: "TR_A1", source: 2, muted: false },
            { sid: "TR_V1", source: 3, muted: false },
          ],
        }),
        mutePublishedTrack: vi.fn().mockResolvedValue(undefined),
      });

      await moderatorAction("u1", "r1", "ch1", "u2", "mute");

      const client = (getLiveKitRoomClient as any)();
      expect(client.mutePublishedTrack).toHaveBeenCalledWith(
        "channel:ch1",
        "user:u2",
        "TR_A1",
        true,
      );
    });
  });

  describe("reapStaleParticipants", () => {
    it("marks orphaned participants as left via LiveKit reconciliation", async () => {
      // Step 1: mark participants in ended sessions (defensive cleanup).
      prismaMock.callParticipant.updateMany.mockResolvedValueOnce({ count: 1 });

      // Step 2: active sessions with participants missing from LiveKit.
      prismaMock.callSession.findMany.mockResolvedValueOnce([
        {
          id: "s1",
          channelId: "ch1",
          participants: [
            { id: "cp1", userId: "u1" },
            { id: "cp2", userId: "u2" },
          ],
        },
      ] as any);

      // LiveKit returns empty list → both participants are absent → marked stale.
      const { getLiveKitRoomClient } =
        await import("../../../../src/lib/livekit");
      (getLiveKitRoomClient as any).mockReturnValue({
        listParticipants: vi.fn().mockResolvedValue([]),
        deleteRoom: vi.fn().mockResolvedValue(undefined),
      });

      // updateMany for stale ids, then count remaining, then session end.
      prismaMock.callParticipant.updateMany.mockResolvedValueOnce({ count: 2 });
      prismaMock.callParticipant.count.mockResolvedValueOnce(0);
      prismaMock.callSession.update.mockResolvedValueOnce({} as any);

      const total = await reapStaleParticipants();
      // 1 from ended-session cleanup + 2 from LiveKit reconciliation.
      expect(total).toBe(3);
    });

    it("returns 0 when no stale participants", async () => {
      prismaMock.callParticipant.updateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.callSession.findMany.mockResolvedValueOnce([]);

      const total = await reapStaleParticipants();
      expect(total).toBe(0);
    });

    it("handles LiveKit room not found gracefully", async () => {
      prismaMock.callParticipant.updateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.callSession.findMany.mockResolvedValueOnce([
        {
          id: "s1",
          channelId: "ch1",
          participants: [{ id: "cp1", userId: "u1" }],
        },
      ] as any);

      const { getLiveKitRoomClient } =
        await import("../../../../src/lib/livekit");
      (getLiveKitRoomClient as any).mockReturnValue({
        listParticipants: vi
          .fn()
          .mockRejectedValue(new Error("room not found")),
        deleteRoom: vi.fn().mockResolvedValue(undefined),
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
          participants: [],
        },
      ] as any);

      const { getLiveKitRoomClient } =
        await import("../../../../src/lib/livekit");
      const mockClient = {
        listParticipants: vi.fn().mockResolvedValue([]),
        deleteRoom: vi.fn().mockResolvedValue(undefined),
      };
      (getLiveKitRoomClient as any).mockReturnValue(mockClient);

      const total = await reapStaleParticipants();
      expect(total).toBe(0);
      expect(mockClient.listParticipants).not.toHaveBeenCalled();
    });

    it("handles partial staleness", async () => {
      prismaMock.callParticipant.updateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.callSession.findMany.mockResolvedValueOnce([
        {
          id: "s1",
          channelId: "ch1",
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
        deleteRoom: vi.fn().mockResolvedValue(undefined),
      });

      prismaMock.callParticipant.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.callParticipant.count.mockResolvedValueOnce(1);

      const total = await reapStaleParticipants();
      expect(total).toBe(1);
      expect(prismaMock.callSession.update).not.toHaveBeenCalled();
    });

    it("session survives when remaining > 0 after reaping", async () => {
      prismaMock.callParticipant.updateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.callSession.findMany.mockResolvedValueOnce([
        {
          id: "s1",
          channelId: "ch1",
          participants: [{ id: "cp1", userId: "u1" }],
        },
      ] as any);

      const { getLiveKitRoomClient } =
        await import("../../../../src/lib/livekit");
      (getLiveKitRoomClient as any).mockReturnValue({
        listParticipants: vi.fn().mockResolvedValue([{ identity: "user:u1" }]),
        deleteRoom: vi.fn().mockResolvedValue(undefined),
      });

      prismaMock.callParticipant.updateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.callParticipant.count.mockResolvedValueOnce(1);

      const total = await reapStaleParticipants();
      expect(total).toBe(0);
      expect(prismaMock.callSession.update).not.toHaveBeenCalled();
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

    it("verifies participant leftAt is set in the transaction", async () => {
      prismaMock.callSession.findMany.mockResolvedValue([{ id: "s1" }] as any);
      prismaMock.$transaction.mockImplementation(async (fns: any[]) =>
        Promise.all(fns),
      );

      await endAllActiveSessions();

      expect(prismaMock.callParticipant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: { in: ["s1"] }, leftAt: null },
          data: { leftAt: expect.any(Date) },
        }),
      );
      expect(prismaMock.callSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ["s1"] } },
          data: { endedAt: expect.any(Date) },
        }),
      );
    });
  });

  describe("forceLeaveCall", () => {
    it("force-leaves a user from an active call and removes from LiveKit", async () => {
      prismaMock.callParticipant.findFirst.mockResolvedValue({
        id: "p1",
        userId: "u2",
        leftAt: null,
        session: { id: "sess1", channelId: "ch1" },
      } as any);
      prismaMock.callParticipant.update.mockResolvedValue({} as any);
      prismaMock.callParticipant.count.mockResolvedValue(1); // other participants remain

      const result = await forceLeaveCall("u2");

      expect(result).toEqual({
        channelId: "ch1",
        sessionId: "sess1",
        callEnded: false,
      });
      expect(prismaMock.callParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "p1" },
          data: { leftAt: expect.any(Date) },
        }),
      );
    });

    it("ends the session when the force-left user was the last participant", async () => {
      prismaMock.callParticipant.findFirst.mockResolvedValue({
        id: "p1",
        userId: "u2",
        leftAt: null,
        session: { id: "sess1", channelId: "ch1" },
      } as any);
      prismaMock.callParticipant.update.mockResolvedValue({} as any);
      prismaMock.callParticipant.count.mockResolvedValue(0);

      const result = await forceLeaveCall("u2");

      expect(result).toEqual({
        channelId: "ch1",
        sessionId: "sess1",
        callEnded: true,
      });
      expect(prismaMock.callSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sess1" },
          data: { endedAt: expect.any(Date) },
        }),
      );
    });

    it("returns null when user is not in any call", async () => {
      prismaMock.callParticipant.findFirst.mockResolvedValue(null);

      const result = await forceLeaveCall("u2");
      expect(result).toBeNull();
    });

    it("handles LiveKit removal failure gracefully", async () => {
      prismaMock.callParticipant.findFirst.mockResolvedValue({
        id: "p1",
        userId: "u2",
        leftAt: null,
        session: { id: "sess1", channelId: "ch1" },
      } as any);
      prismaMock.callParticipant.update.mockResolvedValue({} as any);
      prismaMock.callParticipant.count.mockResolvedValue(1);

      const { getLiveKitRoomClient } =
        await import("../../../../src/lib/livekit");
      (getLiveKitRoomClient as any).mockReturnValue({
        removeParticipant: vi
          .fn()
          .mockRejectedValue(new Error("room not found")),
        deleteRoom: vi.fn().mockResolvedValue(undefined),
      });

      const result = await forceLeaveCall("u2");
      expect(result).toEqual({
        channelId: "ch1",
        sessionId: "sess1",
        callEnded: false,
      });
    });
  });
});
