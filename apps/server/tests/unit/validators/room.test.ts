import { describe, it, expect } from "vitest";
import {
  roomIdSchema,
  userIdSchema,
  createRoomSchema,
  sendInvitationSchema,
  respondInvitationSchema,
  joinRequestActionSchema,
  createJoinLinkSchema,
  joinRequestStatusQuerySchema,
  updateRoomSchema,
  createCategorySchema,
  updateCategorySchema,
  createChannelSchema,
  updateChannelSchema,
  channelNameSchema,
  normalizeChannelName,
  reorderSchema,
  roomIdParamSchema,
  categoryIdParamSchema,
  channelIdParamSchema,
} from "@repo/validators";

describe("room validators", () => {
  describe("roomIdSchema", () => {
    it("should accept a non-empty string", () => {
      const result = roomIdSchema.safeParse("room-1");
      expect(result.success).toBe(true);
    });

    it("should reject an empty string", () => {
      const result = roomIdSchema.safeParse("");
      expect(result.success).toBe(false);
    });
  });

  describe("userIdSchema", () => {
    it("should accept a non-empty string", () => {
      const result = userIdSchema.safeParse("user-1");
      expect(result.success).toBe(true);
    });

    it("should reject an empty string", () => {
      const result = userIdSchema.safeParse("");
      expect(result.success).toBe(false);
    });
  });

  describe("createRoomSchema", () => {
    it("should accept a valid room creation payload", () => {
      const result = createRoomSchema.safeParse({
        name: "My Room",
        description: "A fun room",
      });
      expect(result.success).toBe(true);
    });

    it("should accept a room without description", () => {
      const result = createRoomSchema.safeParse({ name: "My Room" });
      expect(result.success).toBe(true);
    });

    it("should reject an empty name", () => {
      const result = createRoomSchema.safeParse({ name: "" });
      expect(result.success).toBe(false);
    });

    it("should reject a name that is too long", () => {
      const result = createRoomSchema.safeParse({ name: "a".repeat(101) });
      expect(result.success).toBe(false);
    });

    it("should reject a description that is too long", () => {
      const result = createRoomSchema.safeParse({
        name: "My Room",
        description: "a".repeat(501),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("sendInvitationSchema", () => {
    it("should accept a valid targetUserId", () => {
      const result = sendInvitationSchema.safeParse({ targetUserId: "user-1" });
      expect(result.success).toBe(true);
    });

    it("should reject an empty targetUserId", () => {
      const result = sendInvitationSchema.safeParse({ targetUserId: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("respondInvitationSchema", () => {
    it("should accept ACCEPTED", () => {
      const result = respondInvitationSchema.safeParse({ status: "ACCEPTED" });
      expect(result.success).toBe(true);
    });

    it("should accept REJECTED", () => {
      const result = respondInvitationSchema.safeParse({ status: "REJECTED" });
      expect(result.success).toBe(true);
    });

    it("should reject an invalid status", () => {
      const result = respondInvitationSchema.safeParse({ status: "MAYBE" });
      expect(result.success).toBe(false);
    });
  });

  describe("joinRequestActionSchema", () => {
    it("should accept APPROVED", () => {
      const result = joinRequestActionSchema.safeParse({ action: "APPROVED" });
      expect(result.success).toBe(true);
    });

    it("should accept REJECTED", () => {
      const result = joinRequestActionSchema.safeParse({ action: "REJECTED" });
      expect(result.success).toBe(true);
    });

    it("should reject an invalid action", () => {
      const result = joinRequestActionSchema.safeParse({ action: "MAYBE" });
      expect(result.success).toBe(false);
    });
  });

  describe("createJoinLinkSchema", () => {
    it("should accept an empty payload", () => {
      const result = createJoinLinkSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should accept maxUses", () => {
      const result = createJoinLinkSchema.safeParse({ maxUses: 5 });
      expect(result.success).toBe(true);
    });

    it("should reject negative maxUses", () => {
      const result = createJoinLinkSchema.safeParse({ maxUses: -1 });
      expect(result.success).toBe(false);
    });

    it("should accept a valid expiresAt", () => {
      const result = createJoinLinkSchema.safeParse({
        expiresAt: "2025-12-31T23:59:59Z",
      });
      expect(result.success).toBe(true);
    });

    it("should reject an invalid expiresAt", () => {
      const result = createJoinLinkSchema.safeParse({
        expiresAt: "not-a-date",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("joinRequestStatusQuerySchema", () => {
    it("should accept PENDING", () => {
      const result = joinRequestStatusQuerySchema.safeParse({
        status: "PENDING",
      });
      expect(result.success).toBe(true);
    });

    it("should accept undefined status", () => {
      const result = joinRequestStatusQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should reject an invalid status", () => {
      const result = joinRequestStatusQuerySchema.safeParse({
        status: "BANNED",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("updateRoomSchema", () => {
    it("should accept a valid partial update", () => {
      const result = updateRoomSchema.safeParse({
        name: "Renamed",
        description: null,
      });
      expect(result.success).toBe(true);
    });

    it("should reject an empty name", () => {
      const result = updateRoomSchema.safeParse({ name: "" });
      expect(result.success).toBe(false);
    });

    it("should reject an invalid avatarKey", () => {
      const result = updateRoomSchema.safeParse({
        avatarKey: "avatars/user-1/not-a-room.png",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("channelNameSchema", () => {
    it("should normalize to lowercase-hyphen form", () => {
      const result = channelNameSchema.safeParse("General Chat");
      expect(result.success).toBe(true);
      expect(result.data).toBe("general-chat");
    });

    it("should collapse underscores and repeat hyphens", () => {
      const result = channelNameSchema.safeParse("  Help _ Desk  ");
      expect(result.success).toBe(true);
      expect(result.data).toBe("help-desk");
    });

    it("should trim leading and trailing hyphens", () => {
      const result = channelNameSchema.safeParse("-general-");
      expect(result.success).toBe(true);
      expect(result.data).toBe("general");
    });

    it("should reject a name that is too short after trimming", () => {
      const result = channelNameSchema.safeParse("g");
      expect(result.success).toBe(false);
    });

    it("should reject invalid punctuation", () => {
      const result = channelNameSchema.safeParse("hello!!");
      expect(result.success).toBe(false);
    });

    it("normalizeChannelName collapses whitespace runs to single hyphens", () => {
      expect(normalizeChannelName("A  B   c")).toBe("a-b-c");
    });
  });

  describe("createChannelSchema", () => {
    it("should accept a valid channel with default type TEXT", () => {
      const result = createChannelSchema.safeParse({ name: "Music" });
      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({ name: "music", type: "TEXT" }),
      );
    });

    it("should accept a VOICE channel", () => {
      const result = createChannelSchema.safeParse({
        name: "lounge",
        type: "VOICE",
      });
      expect(result.success).toBe(true);
    });

    it("should reject an unsupported channel type", () => {
      const result = createChannelSchema.safeParse({
        name: "news",
        type: "FORUM",
      });
      expect(result.success).toBe(false);
    });

    it("should reject a topic that is too long", () => {
      const result = createChannelSchema.safeParse({
        name: "general",
        topic: "a".repeat(201),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("updateChannelSchema", () => {
    it("should accept a partial update with a new position", () => {
      const result = updateChannelSchema.safeParse({
        topic: "New topic",
        position: 3,
      });
      expect(result.success).toBe(true);
    });

    it("should reject a negative position", () => {
      const result = updateChannelSchema.safeParse({ position: -1 });
      expect(result.success).toBe(false);
    });
  });

  describe("createCategorySchema", () => {
    it("should accept a valid category name", () => {
      const result = createCategorySchema.safeParse({ name: "GAMES" });
      expect(result.success).toBe(true);
    });

    it("should reject an empty name", () => {
      const result = createCategorySchema.safeParse({ name: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("updateCategorySchema", () => {
    it("should accept a rename", () => {
      const result = updateCategorySchema.safeParse({ name: "Music" });
      expect(result.success).toBe(true);
    });

    it("should accept a position", () => {
      const result = updateCategorySchema.safeParse({ position: 0 });
      expect(result.success).toBe(true);
    });

    it("should reject a negative position", () => {
      const result = updateCategorySchema.safeParse({ position: -2 });
      expect(result.success).toBe(false);
    });
  });

  describe("reorderSchema", () => {
    it("should accept a non-empty ordered id list", () => {
      const result = reorderSchema.safeParse({ orderedIds: ["a", "b"] });
      expect(result.success).toBe(true);
    });

    it("should reject an empty list", () => {
      const result = reorderSchema.safeParse({ orderedIds: [] });
      expect(result.success).toBe(false);
    });
  });

  describe("param schemas", () => {
    it("should parse roomId from params", () => {
      const result = roomIdParamSchema.safeParse({ roomId: "r1" });
      expect(result.success).toBe(true);
    });

    it("should reject a missing roomId", () => {
      const result = roomIdParamSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should parse categoryId and channelId from params", () => {
      expect(
        categoryIdParamSchema.safeParse({ categoryId: "c1" }).success,
      ).toBe(true);
      expect(channelIdParamSchema.safeParse({ channelId: "c1" }).success).toBe(
        true,
      );
    });
  });
});
