import { describe, it, expect } from "vitest";
import {
  startDmSchema,
  sendMessageSchema,
  getMessagesSchema,
  editMessageSchema,
  messageIdParamSchema,
  directChatIdParamSchema,
  directChatTypingSchema,
} from "@repo/validators";

describe("direct-chat validators", () => {
  describe("startDmSchema", () => {
    it("should accept a valid userId", () => {
      const result = startDmSchema.safeParse({ userId: "user-1" });
      expect(result.success).toBe(true);
    });

    it("should reject an empty userId", () => {
      const result = startDmSchema.safeParse({ userId: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("sendMessageSchema", () => {
    it("should accept a valid TEXT message", () => {
      const result = sendMessageSchema.safeParse({
        content: "Hello!",
        messageType: "TEXT",
      });
      expect(result.success).toBe(true);
    });

    it("should reject TEXT without content", () => {
      const result = sendMessageSchema.safeParse({
        messageType: "TEXT",
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty content for TEXT", () => {
      const result = sendMessageSchema.safeParse({
        content: "",
        messageType: "TEXT",
      });
      expect(result.success).toBe(false);
    });

    it("should reject content that is too long", () => {
      const result = sendMessageSchema.safeParse({
        content: "a".repeat(30001),
        messageType: "TEXT",
      });
      expect(result.success).toBe(false);
    });

    it("should accept IMAGE with attachments", () => {
      const result = sendMessageSchema.safeParse({
        messageType: "IMAGE",
        attachmentIds: ["att-1"],
      });
      expect(result.success).toBe(true);
    });

    it("should reject IMAGE without attachments", () => {
      const result = sendMessageSchema.safeParse({
        messageType: "IMAGE",
      });
      expect(result.success).toBe(false);
    });

    it("should accept VIDEO with exactly one attachment", () => {
      const result = sendMessageSchema.safeParse({
        messageType: "VIDEO",
        attachmentIds: ["att-1"],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("getMessagesSchema", () => {
    it("should accept empty query params", () => {
      const result = getMessagesSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should accept cursor and limit", () => {
      const result = getMessagesSchema.safeParse({
        cursor: "msg-1",
        limit: "50",
        direction: "before",
      });
      expect(result.success).toBe(true);
    });

    it("should reject limit above 100", () => {
      const result = getMessagesSchema.safeParse({ limit: "101" });
      expect(result.success).toBe(false);
    });

    it("should reject invalid direction", () => {
      const result = getMessagesSchema.safeParse({ direction: "after" });
      expect(result.success).toBe(false);
    });
  });

  describe("editMessageSchema", () => {
    it("should accept valid content", () => {
      const result = editMessageSchema.safeParse({ content: "Updated!" });
      expect(result.success).toBe(true);
    });

    it("should reject empty content", () => {
      const result = editMessageSchema.safeParse({ content: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("messageIdParamSchema", () => {
    it("should accept a non-empty messageId", () => {
      const result = messageIdParamSchema.safeParse({ messageId: "msg-1" });
      expect(result.success).toBe(true);
    });

    it("should reject an empty messageId", () => {
      const result = messageIdParamSchema.safeParse({ messageId: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("directChatIdParamSchema", () => {
    it("should accept a non-empty directChatId", () => {
      const result = directChatIdParamSchema.safeParse({
        directChatId: "dc-1",
      });
      expect(result.success).toBe(true);
    });

    it("should reject an empty directChatId", () => {
      const result = directChatIdParamSchema.safeParse({ directChatId: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("directChatTypingSchema", () => {
    it("should accept start and stop typing events", () => {
      expect(
        directChatTypingSchema.safeParse({
          directChatId: "dc-1",
          isTyping: true,
        }).success,
      ).toBe(true);
      expect(
        directChatTypingSchema.safeParse({
          directChatId: "dc-1",
          isTyping: false,
        }).success,
      ).toBe(true);
    });

    it("should reject a missing isTyping flag", () => {
      const result = directChatTypingSchema.safeParse({
        directChatId: "dc-1",
      });
      expect(result.success).toBe(false);
    });

    it("should reject an empty directChatId", () => {
      const result = directChatTypingSchema.safeParse({
        directChatId: "",
        isTyping: true,
      });
      expect(result.success).toBe(false);
    });
  });
});
