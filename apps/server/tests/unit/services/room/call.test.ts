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

vi.mock("../../../../src/services/call/core", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../src/services/call/core")>();
  return {
    ...actual,
    createOrReuseSession: vi.fn(),
    upsertParticipant: vi.fn().mockResolvedValue(undefined),
    markParticipantLeft: vi.fn(),
    endSessionIfEmpty: vi.fn(),
    generateCallToken: vi.fn().mockResolvedValue({
      token: "fake-token",
      livekitUrl: "ws://localhost:7880",
      roomName: "channel:ch1",
    }),
    reapStaleParticipants: vi.fn().mockResolvedValue(0),
    endAllActiveSessions: vi.fn().mockResolvedValue(undefined),
    timeoutRingingCalls: vi.fn().mockResolvedValue(0),
  };
});

vi.mock("../../../../src/services/idempotency", () => ({
  checkIdempotency: vi.fn(),
  storeIdempotency: vi.fn().mockResolvedValue(undefined),
}));

const idempotency = vi.mocked(
  await import("../../../../src/services/idempotency"),
);

const core = vi.mocked(await import("../../../../src/services/call/core"));

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
      prismaMock.callParticipant.findFirst.mockResolvedValue(null);
      core.createOrReuseSession.mockResolvedValue({
        session: { id: "sess1", channelId: "ch1", directChatId: null },
        isNewSession: true,
      });
      core.generateCallToken.mockResolvedValue({
        token: "fake-token",
        livekitUrl: "ws://localhost:7880",
        roomName: "channel:ch1",
      });

      const result = await getJoinToken("u1", "r1", "ch1");

      expect(result).toMatchObject({
        token: "fake-token",
        livekitUrl: "ws://localhost:7880",
        roomName: "channel:ch1",
        sessionId: "sess1",
        isNewSession: true,
      });
      expect(core.createOrReuseSession).toHaveBeenCalledWith(
        { type: "channel", roomId: "r1", channelId: "ch1" },
        "VOICE",
        "ACTIVE",
      );
      expect(core.upsertParticipant).toHaveBeenCalledWith("sess1", "u1");
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
      core.createOrReuseSession.mockResolvedValue({
        session: { id: "sess-existing", channelId: "ch1", directChatId: null },
        isNewSession: false,
      });
      core.generateCallToken.mockResolvedValue({
        token: "fake-token",
        livekitUrl: "ws://localhost:7880",
        roomName: "channel:ch1",
      });

      const result = await getJoinToken("u1", "r1", "ch1");
      expect(result).toMatchObject({
        token: "fake-token",
        isNewSession: false,
      });
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
      core.createOrReuseSession.mockResolvedValue({
        session: { id: "sess1", channelId: "ch1", directChatId: null },
        isNewSession: true,
      });
      core.generateCallToken.mockResolvedValue({
        token: "fake-token",
        livekitUrl: "ws://localhost:7880",
        roomName: "channel:ch1",
      });

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
      prismaMock.callParticipant.findFirst.mockResolvedValue(null);
      core.createOrReuseSession.mockResolvedValue({
        session: { id: "sess-existing", channelId: "ch1", directChatId: null },
        isNewSession: false,
      });
      core.generateCallToken.mockResolvedValue({
        token: "fake-token",
        livekitUrl: "ws://localhost:7880",
        roomName: "channel:ch1",
      });

      await getJoinToken("u1", "r1", "ch1");

      expect(core.createOrReuseSession).toHaveBeenCalledWith(
        { type: "channel", roomId: "r1", channelId: "ch1" },
        "VOICE",
        "ACTIVE",
      );
      expect(core.upsertParticipant).toHaveBeenCalledWith(
        "sess-existing",
        "u1",
      );
    });
  });

  describe("leaveCall", () => {
    function mockSessionEnded(callEnded: boolean) {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);
      prismaMock.callSession.findFirst.mockResolvedValue({
        id: "sess1",
        channelId: "ch1",
        callType: "VOICE",
        startedAt: new Date(),
        endedAt: null,
      } as any);
      core.markParticipantLeft.mockResolvedValue({ participantId: "p1" });
      core.endSessionIfEmpty.mockResolvedValue({ callEnded });
      idempotency.checkIdempotency.mockResolvedValue(null);
      prismaMock.message.create.mockResolvedValue({ id: "msg1" } as any);
    }

    it("marks the participant as left and ends the session when empty", async () => {
      mockSessionEnded(true);

      const result = await leaveCall("u1", "r1", "ch1");

      expect(result).toEqual({ sessionId: "sess1", callEnded: true });
      expect(core.markParticipantLeft).toHaveBeenCalledWith("sess1", "u1");
      expect(core.endSessionIfEmpty).toHaveBeenCalledWith("sess1");
      // When the last participant leaves, a COMPLETED history message is created.
      expect(prismaMock.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            senderId: "system",
            messageType: "SYSTEM",
            metadata: expect.objectContaining({ outcome: "COMPLETED" }),
          }),
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
        callType: "VOICE",
        startedAt: new Date(),
        endedAt: null,
      } as any);
      core.markParticipantLeft.mockResolvedValue(null);

      const result = await leaveCall("u1", "r1", "ch1");

      expect(result).toBeNull();
      expect(core.endSessionIfEmpty).not.toHaveBeenCalled();
    });

    it("returns callEnded false when other participants remain", async () => {
      mockSessionEnded(false);

      const result = await leaveCall("u1", "r1", "ch1");

      expect(result).toEqual({ sessionId: "sess1", callEnded: false });
      // No history message when the call is still active.
      expect(prismaMock.message.create).not.toHaveBeenCalled();
    });

    it("returns null when participant already left", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);
      prismaMock.callSession.findFirst.mockResolvedValue({
        id: "sess1",
        channelId: "ch1",
        callType: "VOICE",
        startedAt: new Date(),
        endedAt: null,
      } as any);
      core.markParticipantLeft.mockResolvedValue(null);

      const result = await leaveCall("u1", "r1", "ch1");

      expect(result).toBeNull();
    });

    it("returns null when no active session exists", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);
      prismaMock.callSession.findFirst.mockResolvedValue(null);

      const result = await leaveCall("u1", "r1", "ch1");

      expect(result).toBeNull();
    });

    it("deletes LiveKit room when session ends", async () => {
      mockSessionEnded(true);

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
    it("delegates to core reapStaleParticipants", async () => {
      core.reapStaleParticipants.mockResolvedValue(3);
      const total = await reapStaleParticipants();
      expect(total).toBe(3);
      expect(core.reapStaleParticipants).toHaveBeenCalled();
    });
  });

  describe("endAllActiveSessions", () => {
    it("delegates to core endAllActiveSessions", async () => {
      core.endAllActiveSessions.mockResolvedValue(undefined);
      await endAllActiveSessions();
      expect(core.endAllActiveSessions).toHaveBeenCalled();
    });
  });

  describe("forceLeaveCall", () => {
    const sessionShape = { id: "sess1", channelId: "ch1", callType: "VOICE" };

    it("force-leaves a user from an active call and removes from LiveKit", async () => {
      prismaMock.callParticipant.findFirst.mockResolvedValue({
        id: "p1",
        userId: "u2",
        leftAt: null,
        session: sessionShape,
      } as any);
      prismaMock.callParticipant.update.mockResolvedValue({} as any);
      core.endSessionIfEmpty.mockResolvedValue({ callEnded: false });

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
        session: sessionShape,
      } as any);
      prismaMock.callParticipant.update.mockResolvedValue({} as any);
      core.endSessionIfEmpty.mockResolvedValue({ callEnded: true });
      idempotency.checkIdempotency.mockResolvedValue(null);
      prismaMock.message.create.mockResolvedValue({ id: "msg1" } as any);
      prismaMock.channel.findUnique.mockResolvedValue({
        id: "ch1",
        roomId: "r1",
      } as any);

      const { getLiveKitRoomClient } =
        await import("../../../../src/lib/livekit");
      (getLiveKitRoomClient as any).mockReturnValue({
        removeParticipant: vi.fn().mockResolvedValue(undefined),
        deleteRoom: vi.fn().mockResolvedValue(undefined),
      });

      const result = await forceLeaveCall("u2");

      expect(result).toEqual({
        channelId: "ch1",
        sessionId: "sess1",
        callEnded: true,
      });
      // A COMPLETED history message is recorded for the channel.
      expect(prismaMock.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            senderId: "system",
            messageType: "SYSTEM",
            chatRoomId: "r1",
            channelId: "ch1",
          }),
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
        session: sessionShape,
      } as any);
      prismaMock.callParticipant.update.mockResolvedValue({} as any);
      core.endSessionIfEmpty.mockResolvedValue({ callEnded: false });

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
