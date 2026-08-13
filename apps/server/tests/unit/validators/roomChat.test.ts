import { describe, it, expect } from "vitest";
import { chatRoomMessageSchema, chatRoomTypingSchema } from "@repo/validators";

describe("roomChat validators", () => {
  describe("TEXT message", () => {
    it("should accept a valid TEXT message", () => {
      const result = chatRoomMessageSchema.safeParse({
        messageType: "TEXT",
        chatRoomId: "room-1",
        content: "Hello!",
      });
      expect(result.success).toBe(true);
    });

    it("should reject TEXT message with empty content", () => {
      const result = chatRoomMessageSchema.safeParse({
        messageType: "TEXT",
        chatRoomId: "room-1",
        content: "",
      });
      expect(result.success).toBe(false);
    });

    it("should reject TEXT message with missing content", () => {
      const result = chatRoomMessageSchema.safeParse({
        messageType: "TEXT",
        chatRoomId: "room-1",
      });
      expect(result.success).toBe(false);
    });

    it("should reject TEXT message with content too long", () => {
      const result = chatRoomMessageSchema.safeParse({
        messageType: "TEXT",
        chatRoomId: "room-1",
        content: "a".repeat(2001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("IMAGE message", () => {
    it("should accept IMAGE with attachments", () => {
      const result = chatRoomMessageSchema.safeParse({
        messageType: "IMAGE",
        chatRoomId: "room-1",
        attachmentIds: ["att-1", "att-2"],
      });
      expect(result.success).toBe(true);
    });

    it("should reject IMAGE without attachments", () => {
      const result = chatRoomMessageSchema.safeParse({
        messageType: "IMAGE",
        chatRoomId: "room-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("VIDEO message", () => {
    it("should accept VIDEO with exactly one attachment", () => {
      const result = chatRoomMessageSchema.safeParse({
        messageType: "VIDEO",
        chatRoomId: "room-1",
        attachmentIds: ["att-1"],
      });
      expect(result.success).toBe(true);
    });

    it("should reject VIDEO with zero attachments", () => {
      const result = chatRoomMessageSchema.safeParse({
        messageType: "VIDEO",
        chatRoomId: "room-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("invalid type", () => {
    it("should reject SYSTEM message from client", () => {
      const result = chatRoomMessageSchema.safeParse({
        messageType: "SYSTEM",
        chatRoomId: "room-1",
        content: "System update",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("chatRoomTypingSchema", () => {
    it("should accept start and stop typing events", () => {
      expect(
        chatRoomTypingSchema.safeParse({
          chatRoomId: "room-1",
          isTyping: true,
        }).success,
      ).toBe(true);
      expect(
        chatRoomTypingSchema.safeParse({
          chatRoomId: "room-1",
          isTyping: false,
        }).success,
      ).toBe(true);
    });

    it("should reject a missing isTyping flag", () => {
      const result = chatRoomTypingSchema.safeParse({ chatRoomId: "room-1" });
      expect(result.success).toBe(false);
    });

    it("should reject an empty chatRoomId", () => {
      const result = chatRoomTypingSchema.safeParse({
        chatRoomId: "",
        isTyping: true,
      });
      expect(result.success).toBe(false);
    });
  });
});
