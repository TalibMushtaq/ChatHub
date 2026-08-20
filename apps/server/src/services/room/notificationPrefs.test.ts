import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

describe("Room Notification Preferences", () => {
  const testUserId = "user-test-1";
  const testRoomId = "room-test-1";

  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  describe("getRoomMemberNotificationPref", () => {
    it("should return the user's notification preference", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        notificationPref: "ALL",
      });

      const result = await prismaMock.chatRoomMember.findUnique({
        where: {
          userId_chatRoomId: {
            userId: testUserId,
            chatRoomId: testRoomId,
          },
        },
        select: { notificationPref: true },
      });

      expect(result?.notificationPref).toBe("ALL");
    });

    it("should return MENTIONS when set", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        notificationPref: "MENTIONS",
      });

      const result = await prismaMock.chatRoomMember.findUnique({
        where: {
          userId_chatRoomId: {
            userId: testUserId,
            chatRoomId: testRoomId,
          },
        },
        select: { notificationPref: true },
      });

      expect(result?.notificationPref).toBe("MENTIONS");
    });

    it("should return null when not a member", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue(null);

      const result = await prismaMock.chatRoomMember.findUnique({
        where: {
          userId_chatRoomId: {
            userId: testUserId,
            chatRoomId: testRoomId,
          },
        },
        select: { notificationPref: true },
      });

      expect(result).toBeNull();
    });
  });

  describe("updateRoomNotificationPref", () => {
    it("should update the notification preference successfully", async () => {
      prismaMock.chatRoomMember.update.mockResolvedValue({
        notificationPref: "MENTIONS",
      });

      const result = await prismaMock.chatRoomMember.update({
        where: {
          userId_chatRoomId: {
            userId: testUserId,
            chatRoomId: testRoomId,
          },
        },
        data: { notificationPref: "MENTIONS" },
        select: { notificationPref: true },
      });

      expect(result?.notificationPref).toBe("MENTIONS");
    });

    it("should update to MUTED", async () => {
      prismaMock.chatRoomMember.update.mockResolvedValue({
        notificationPref: "MUTED",
      });

      const result = await prismaMock.chatRoomMember.update({
        where: {
          userId_chatRoomId: {
            userId: testUserId,
            chatRoomId: testRoomId,
          },
        },
        data: { notificationPref: "MUTED" },
        select: { notificationPref: true },
      });

      expect(result?.notificationPref).toBe("MUTED");
    });
  });
});
