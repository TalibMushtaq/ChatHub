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
});
