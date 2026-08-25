import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  changeMemberRole,
  kickMember,
  banMember,
  unbanMember,
  isBanned,
  getRoomBans,
  muteMember,
  unmuteMember,
  setNickname,
  isMuted,
} from "../../../../src/services/room/members";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

// Mock forceLeaveCall so tests don't touch LiveKit.
vi.mock("../../../../src/services/room/call", () => ({
  forceLeaveCall: vi.fn().mockResolvedValue(null),
}));

import { forceLeaveCall } from "../../../../src/services/room/call";

// A minimal member row shaped like assertAndLoadMember's `memberSelect` return.
function memberRow(overrides: Partial<any> = {}) {
  return {
    id: "m1",
    userId: "u2",
    chatRoomId: "r1",
    role: "MEMBER",
    joinedAt: new Date("2026-01-01"),
    nickname: null,
    mutedUntil: null,
    User: {
      id: "u2",
      username: "user2",
      displayName: null,
      avatar: null,
    },
    ...overrides,
  };
}

describe("room members service", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  describe("changeMemberRole", () => {
    it("promotes a member to MODERATOR when the caller is an owner", async () => {
      // getRoomRole resolves OWNER (via findUnique with select {role}), then
      // assertAndLoadMember resolves the target member row.
      prismaMock.chatRoomMember.findUnique
        .mockResolvedValueOnce({ role: "OWNER" } as any)
        .mockResolvedValueOnce(memberRow() as any);
      prismaMock.chatRoomMember.update.mockResolvedValue(
        memberRow({ role: "MODERATOR" }) as any,
      );

      const result = await changeMemberRole("u1", "r1", "u2", "MODERATOR");

      expect(result.role).toBe("MODERATOR");
      expect(prismaMock.chatRoomMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "m1" },
          data: { role: "MODERATOR" },
        }),
      );
    });

    it("rejects an admin changing another admin's role (only owner can)", async () => {
      prismaMock.chatRoomMember.findUnique
        .mockResolvedValueOnce({ role: "ADMIN" } as any)
        .mockResolvedValueOnce(memberRow({ role: "ADMIN" }) as any);

      await expect(
        changeMemberRole("u1", "r1", "u2", "MEMBER"),
      ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
      expect(prismaMock.chatRoomMember.update).not.toHaveBeenCalled();
    });

    it("rejects changing the owner's role", async () => {
      prismaMock.chatRoomMember.findUnique
        .mockResolvedValueOnce({ role: "OWNER" } as any)
        .mockResolvedValueOnce(memberRow({ role: "OWNER" }) as any);

      await expect(
        changeMemberRole("u1", "r1", "u2", "MEMBER"),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("rejects changing your own role", async () => {
      await expect(
        changeMemberRole("u1", "r1", "u1", "MEMBER"),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(prismaMock.chatRoomMember.update).not.toHaveBeenCalled();
    });

    it("rejects a member lacking MANAGE_ROLES", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);

      await expect(
        changeMemberRole("u1", "r1", "u2", "MEMBER"),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("kickMember", () => {
    it("removes the member and their read receipt", async () => {
      prismaMock.chatRoomMember.findUnique
        .mockResolvedValueOnce({ role: "OWNER" } as any)
        .mockResolvedValueOnce(memberRow() as any);
      prismaMock.$transaction.mockImplementation((ops: any[]) =>
        Promise.all(ops),
      );

      const result = await kickMember("u1", "r1", "u2");

      expect(result.userId).toBe("u2");
      expect(prismaMock.chatRoomMember.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u2", chatRoomId: "r1" },
      });
      expect(prismaMock.chatRoomReadReceipt.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u2", chatRoomId: "r1" },
      });
    });

    it("rejects kicking the owner", async () => {
      prismaMock.chatRoomMember.findUnique
        .mockResolvedValueOnce({ role: "ADMIN" } as any)
        .mockResolvedValueOnce(memberRow({ role: "OWNER" }) as any);

      await expect(kickMember("u1", "r1", "u2")).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("rejects kicking yourself", async () => {
      await expect(kickMember("u1", "r1", "u1")).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe("banMember / unbanMember / isBanned", () => {
    it("records a ban and removes the membership", async () => {
      prismaMock.chatRoomMember.findUnique
        .mockResolvedValueOnce({ role: "OWNER" } as any)
        .mockResolvedValueOnce(memberRow() as any);
      prismaMock.roomBan.upsert.mockResolvedValue({ id: "b1" } as any);
      prismaMock.chatRoomMember.deleteMany.mockResolvedValue({
        count: 1,
      } as any);
      prismaMock.chatRoomReadReceipt.deleteMany.mockResolvedValue({
        count: 0,
      } as any);
      prismaMock.$transaction.mockImplementation(async (fn: any) =>
        fn(prismaMock),
      );

      const result = await banMember("u1", "r1", "u2", "spam");

      expect(result.userId).toBe("u2");
      expect(prismaMock.roomBan.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            roomId: "r1",
            userId: "u2",
            bannedById: "u1",
            reason: "spam",
          }),
        }),
      );
      expect(prismaMock.chatRoomMember.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u2", chatRoomId: "r1" },
      });
    });

    it("unban removes the RoomBan row", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "OWNER",
      } as any);
      prismaMock.roomBan.deleteMany.mockResolvedValue({ count: 1 } as any);

      const result = await unbanMember("u1", "r1", "u2");
      expect(result.userId).toBe("u2");
    });

    it("unban of a non-banned user throws 404", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "OWNER",
      } as any);
      prismaMock.roomBan.deleteMany.mockResolvedValue({ count: 0 } as any);

      await expect(unbanMember("u1", "r1", "u2")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("isBanned reports the roomBan existence", async () => {
      prismaMock.roomBan.findUnique.mockResolvedValue({ id: "b1" } as any);
      await expect(isBanned("r1", "u2")).resolves.toBe(true);

      prismaMock.roomBan.findUnique.mockResolvedValue(null as any);
      await expect(isBanned("r1", "u2")).resolves.toBe(false);
    });

    it("getRoomBans lists bans with the banned user and actor", async () => {
      prismaMock.roomBan.findMany.mockResolvedValue([
        {
          id: "b1",
          reason: "spam",
          createdAt: new Date(),
          userId: "u2",
          bannedBy: {
            id: "u1",
            username: "u1",
            displayName: null,
            avatar: null,
          },
          User: { id: "u2", username: "u2", displayName: null, avatar: null },
        },
      ] as any);

      const bans = await getRoomBans("r1");
      expect(bans).toHaveLength(1);
      expect(bans[0].user.id).toBe("u2");
      expect(bans[0].bannedBy.id).toBe("u1");
    });
  });

  describe("muteMember / unmuteMember / isMuted", () => {
    it("sets mutedUntil on the member", async () => {
      prismaMock.chatRoomMember.findUnique
        .mockResolvedValueOnce({ role: "OWNER" } as any)
        .mockResolvedValueOnce(memberRow() as any);
      const mutedUntil = new Date(Date.now() + 10 * 60_000);
      prismaMock.chatRoomMember.update.mockResolvedValue(
        memberRow({ mutedUntil }) as any,
      );

      const result = await muteMember("u1", "r1", "u2", 10);
      expect(result.mutedUntil).toBe(mutedUntil);
    });

    it("unmute clears mutedUntil", async () => {
      prismaMock.chatRoomMember.findUnique
        .mockResolvedValueOnce({ role: "OWNER" } as any)
        .mockResolvedValueOnce(memberRow({ mutedUntil: new Date() }) as any);
      prismaMock.chatRoomMember.update.mockResolvedValue(
        memberRow({ mutedUntil: null }) as any,
      );

      const result = await unmuteMember("u1", "r1", "u2");
      expect(result.mutedUntil).toBeNull();
    });

    it("isMuted is true only while mutedUntil is in the future", () => {
      expect(isMuted({ mutedUntil: new Date(Date.now() + 1000) })).toBe(true);
      expect(isMuted({ mutedUntil: new Date(Date.now() - 1000) })).toBe(false);
      expect(isMuted({ mutedUntil: null })).toBe(false);
    });
  });

  describe("setNickname", () => {
    it("lets a user set their own nickname", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue(
        memberRow({ userId: "u1", id: "m-self" }) as any,
      );
      prismaMock.chatRoomMember.update.mockResolvedValue(
        memberRow({ userId: "u1", nickname: "Cool" }) as any,
      );

      const result = await setNickname("u1", "r1", "u1", "Cool");
      expect(result.nickname).toBe("Cool");
    });

    it("lets an admin set another member's nickname", async () => {
      prismaMock.chatRoomMember.findUnique
        .mockResolvedValueOnce({ role: "ADMIN" } as any)
        .mockResolvedValueOnce(memberRow() as any)
        .mockResolvedValueOnce(memberRow() as any);
      prismaMock.chatRoomMember.update.mockResolvedValue(
        memberRow({ nickname: "Renamed" }) as any,
      );

      const result = await setNickname("u1", "r1", "u2", "Renamed");
      expect(result.nickname).toBe("Renamed");
    });

    it("clears the nickname when null", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue(
        memberRow({ userId: "u1", id: "m-self", nickname: "Old" }) as any,
      );
      prismaMock.chatRoomMember.update.mockResolvedValue(
        memberRow({ userId: "u1", nickname: null }) as any,
      );

      const result = await setNickname("u1", "r1", "u1", null);
      expect(result.nickname).toBeNull();
    });
  });

  describe("kickMember force-leave", () => {
    it("force-leaves the user from any active call after kick", async () => {
      prismaMock.chatRoomMember.findUnique
        .mockResolvedValueOnce({ role: "OWNER" } as any)
        .mockResolvedValueOnce(memberRow() as any);
      prismaMock.$transaction.mockImplementation((ops: any[]) =>
        Promise.all(ops),
      );
      vi.mocked(forceLeaveCall).mockResolvedValueOnce({
        channelId: "ch1",
        sessionId: "sess1",
        callEnded: true,
      });

      const result = await kickMember("u1", "r1", "u2");

      expect(result.callInfo).toEqual({
        channelId: "ch1",
        sessionId: "sess1",
        callEnded: true,
      });
      expect(forceLeaveCall).toHaveBeenCalledWith("u2");
    });

    it("returns callInfo null when user was not in a call", async () => {
      prismaMock.chatRoomMember.findUnique
        .mockResolvedValueOnce({ role: "OWNER" } as any)
        .mockResolvedValueOnce(memberRow() as any);
      prismaMock.$transaction.mockImplementation((ops: any[]) =>
        Promise.all(ops),
      );
      vi.mocked(forceLeaveCall).mockResolvedValueOnce(null);

      const result = await kickMember("u1", "r1", "u2");

      expect(result.callInfo).toBeNull();
    });

    it("still completes kick even if forceLeaveCall throws", async () => {
      prismaMock.chatRoomMember.findUnique
        .mockResolvedValueOnce({ role: "OWNER" } as any)
        .mockResolvedValueOnce(memberRow() as any);
      prismaMock.$transaction.mockImplementation((ops: any[]) =>
        Promise.all(ops),
      );
      vi.mocked(forceLeaveCall).mockRejectedValueOnce(
        new Error("LiveKit unreachable"),
      );

      const result = await kickMember("u1", "r1", "u2");

      expect(result.userId).toBe("u2");
      // callInfo is null because force-leave failed (best-effort).
      expect(result.callInfo).toBeNull();
    });
  });

  describe("banMember force-leave", () => {
    it("force-leaves the user from any active call after ban", async () => {
      prismaMock.chatRoomMember.findUnique
        .mockResolvedValueOnce({ role: "OWNER" } as any)
        .mockResolvedValueOnce(memberRow() as any);
      prismaMock.roomBan.upsert.mockResolvedValue({ id: "b1" } as any);
      prismaMock.chatRoomMember.deleteMany.mockResolvedValue({
        count: 1,
      } as any);
      prismaMock.chatRoomReadReceipt.deleteMany.mockResolvedValue({
        count: 0,
      } as any);
      prismaMock.$transaction.mockImplementation(async (fn: any) =>
        fn(prismaMock),
      );
      vi.mocked(forceLeaveCall).mockResolvedValueOnce({
        channelId: "ch1",
        sessionId: "sess1",
        callEnded: false,
      });

      const result = await banMember("u1", "r1", "u2");

      expect(result.callInfo).toEqual({
        channelId: "ch1",
        sessionId: "sess1",
        callEnded: false,
      });
      expect(forceLeaveCall).toHaveBeenCalledWith("u2");
    });

    it("still completes ban even if forceLeaveCall throws", async () => {
      prismaMock.chatRoomMember.findUnique
        .mockResolvedValueOnce({ role: "OWNER" } as any)
        .mockResolvedValueOnce(memberRow() as any);
      prismaMock.roomBan.upsert.mockResolvedValue({ id: "b1" } as any);
      prismaMock.chatRoomMember.deleteMany.mockResolvedValue({
        count: 1,
      } as any);
      prismaMock.chatRoomReadReceipt.deleteMany.mockResolvedValue({
        count: 0,
      } as any);
      prismaMock.$transaction.mockImplementation(async (fn: any) =>
        fn(prismaMock),
      );
      vi.mocked(forceLeaveCall).mockRejectedValueOnce(
        new Error("LiveKit unreachable"),
      );

      const result = await banMember("u1", "r1", "u2");

      expect(result.userId).toBe("u2");
      expect(result.callInfo).toBeNull();
    });
  });
});
