import { describe, it, expect } from "vitest";
import {
  startDmSchema,
  sendMessageSchema,
  getMessagesSchema,
  editMessageSchema,
  messageIdParamSchema,
  directChatIdParamSchema,
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
    it("should accept a valid message", () => {
      const result = sendMessageSchema.safeParse({ content: "Hello!" });
      expect(result.success).toBe(true);
    });

    it("should reject empty content", () => {
      const result = sendMessageSchema.safeParse({ content: "" });
      expect(result.success).toBe(false);
    });

    it("should reject content that is too long", () => {
      const result = sendMessageSchema.safeParse({ content: "a".repeat(5001) });
      expect(result.success).toBe(false);
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
});
