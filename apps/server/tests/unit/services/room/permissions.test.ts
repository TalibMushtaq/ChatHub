import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  roleHasPermission,
  roleAtLeast,
  getRoomRole,
  assertRoomPermission,
  assertRoleAtLeast,
} from "../../../../src/services/room/permissions";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

describe("room permissions", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  describe("roleHasPermission", () => {
    it("grants OWNER every permission", () => {
      expect(roleHasPermission("OWNER", "MANAGE_ROOM")).toBe(true);
      expect(roleHasPermission("OWNER", "MANAGE_ROLES")).toBe(true);
      expect(roleHasPermission("OWNER", "VIEW_CHANNEL")).toBe(true);
    });

    it("grants ADMIN manage but not manage room/roles", () => {
      expect(roleHasPermission("ADMIN", "MANAGE_MEMBERS")).toBe(true);
      expect(roleHasPermission("ADMIN", "MANAGE_CHANNELS")).toBe(true);
      expect(roleHasPermission("ADMIN", "MANAGE_ROOM")).toBe(false);
      expect(roleHasPermission("ADMIN", "MANAGE_ROLES")).toBe(false);
    });

    it("grants MEMBER only view and send", () => {
      expect(roleHasPermission("MEMBER", "VIEW_CHANNEL")).toBe(true);
      expect(roleHasPermission("MEMBER", "SEND_MESSAGES")).toBe(true);
      expect(roleHasPermission("MEMBER", "MANAGE_MESSAGES")).toBe(false);
    });

    it("grants MODERATOR message and voice but not room management", () => {
      expect(roleHasPermission("MODERATOR", "VIEW_CHANNEL")).toBe(true);
      expect(roleHasPermission("MODERATOR", "SEND_MESSAGES")).toBe(true);
      expect(roleHasPermission("MODERATOR", "MANAGE_MESSAGES")).toBe(true);
      expect(roleHasPermission("MODERATOR", "CONNECT_VOICE")).toBe(true);
      expect(roleHasPermission("MODERATOR", "SPEAK_VOICE")).toBe(true);
      expect(roleHasPermission("MODERATOR", "VIDEO_VOICE")).toBe(true);
      expect(roleHasPermission("MODERATOR", "SCREENSHARE_VOICE")).toBe(true);
      expect(roleHasPermission("MODERATOR", "MOVE_MEMBERS_VOICE")).toBe(true);
      expect(roleHasPermission("MODERATOR", "MANAGE_CHANNELS")).toBe(false);
      expect(roleHasPermission("MODERATOR", "MANAGE_CATEGORIES")).toBe(false);
      expect(roleHasPermission("MODERATOR", "MANAGE_MEMBERS")).toBe(false);
      expect(roleHasPermission("MODERATOR", "MANAGE_ROLES")).toBe(false);
      expect(roleHasPermission("MODERATOR", "MANAGE_ROOM")).toBe(false);
      expect(roleHasPermission("MODERATOR", "MENTION_EVERYONE")).toBe(false);
    });
  });

  describe("roleAtLeast", () => {
    it("orders roles MEMBER < ADMIN < OWNER", () => {
      expect(roleAtLeast("OWNER", "MEMBER")).toBe(true);
      expect(roleAtLeast("ADMIN", "ADMIN")).toBe(true);
      expect(roleAtLeast("MEMBER", "OWNER")).toBe(false);
      expect(roleAtLeast("MEMBER", "ADMIN")).toBe(false);
    });

    it("includes MODERATOR in the ordering", () => {
      expect(roleAtLeast("MODERATOR", "MEMBER")).toBe(true);
      expect(roleAtLeast("MODERATOR", "MODERATOR")).toBe(true);
      expect(roleAtLeast("MODERATOR", "ADMIN")).toBe(false);
      expect(roleAtLeast("MODERATOR", "OWNER")).toBe(false);
      expect(roleAtLeast("ADMIN", "MODERATOR")).toBe(true);
      expect(roleAtLeast("MEMBER", "MODERATOR")).toBe(false);
    });
  });

  describe("getRoomRole", () => {
    it("returns the membership role", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);

      await expect(getRoomRole("u1", "r1")).resolves.toBe("ADMIN");
    });

    it("returns MODERATOR for a moderator member", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MODERATOR",
      } as any);

      await expect(getRoomRole("u1", "r1")).resolves.toBe("MODERATOR");
      expect(prismaMock.chatRoomMember.findUnique).toHaveBeenCalledWith({
        where: { userId_chatRoomId: { userId: "u1", chatRoomId: "r1" } },
        select: { role: true },
      });
    });

    it("throws 403 for non-members", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue(null as any);

      await expect(getRoomRole("u1", "r1")).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
    });
  });

  describe("assertRoomPermission", () => {
    it("allows a member with the permission", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);

      await expect(
        assertRoomPermission("u1", "r1", "VIEW_CHANNEL"),
      ).resolves.toBeUndefined();
    });

    it("allows a moderator with MANAGE_MESSAGES", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MODERATOR",
      } as any);

      await expect(
        assertRoomPermission("u1", "r1", "MANAGE_MESSAGES"),
      ).resolves.toBeUndefined();
    });

    it("throws 403 when the role lacks the permission", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);

      await expect(
        assertRoomPermission("u1", "r1", "MANAGE_CHANNELS"),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
    });
  });

  describe("assertRoleAtLeast", () => {
    it("passes and returns the role when senior enough", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "OWNER",
      } as any);

      await expect(assertRoleAtLeast("u1", "r1", "OWNER")).resolves.toBe(
        "OWNER",
      );
    });

    it("allows a moderator when min role is MEMBER", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MODERATOR",
      } as any);

      await expect(assertRoleAtLeast("u1", "r1", "MEMBER")).resolves.toBe(
        "MODERATOR",
      );
    });

    it("throws 403 when moderator is below ADMIN", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MODERATOR",
      } as any);

      await expect(
        assertRoleAtLeast("u1", "r1", "ADMIN"),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
    });

    it("throws 403 when below the required role", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);

      await expect(
        assertRoleAtLeast("u1", "r1", "OWNER"),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
    });
  });
});
