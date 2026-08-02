import { describe, it, expect } from "vitest";
import { chatRoomMessageSchema } from "@repo/validators";

describe("roomChat validators", () => {
  describe("TEXT message", () => {
    it("should accept a valid TEXT message", () => {
      const result = chatRoomMessageSchema.safeParse({
        type: "TEXT",
        chatRoomId: "room-1",
        content: "Hello!",
      });
      expect(result.success).toBe(true);
    });

    it("should reject TEXT message with empty content", () => {
      const result = chatRoomMessageSchema.safeParse({
        type: "TEXT",
        chatRoomId: "room-1",
        content: "",
      });
      expect(result.success).toBe(false);
    });

    it("should reject TEXT message with missing content", () => {
      const result = chatRoomMessageSchema.safeParse({
        type: "TEXT",
        chatRoomId: "room-1",
      });
      expect(result.success).toBe(false);
    });

    it("should reject TEXT message with content too long", () => {
      const result = chatRoomMessageSchema.safeParse({
        type: "TEXT",
        chatRoomId: "room-1",
        content: "a".repeat(2001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("FILE message", () => {
    it("should accept a valid FILE message", () => {
      const result = chatRoomMessageSchema.safeParse({
        type: "FILE",
        chatRoomId: "room-1",
        content: "Check this out",
        fileUrl: "https://example.com/file.pdf",
        fileName: "file.pdf",
        fileSize: 1024,
      });
      expect(result.success).toBe(true);
    });

    it("should accept FILE message without optional content", () => {
      const result = chatRoomMessageSchema.safeParse({
        type: "FILE",
        chatRoomId: "room-1",
        fileUrl: "https://example.com/file.pdf",
        fileName: "file.pdf",
        fileSize: 1024,
      });
      expect(result.success).toBe(true);
    });

    it("should reject FILE message with invalid URL", () => {
      const result = chatRoomMessageSchema.safeParse({
        type: "FILE",
        chatRoomId: "room-1",
        fileUrl: "not-a-url",
        fileName: "file.pdf",
        fileSize: 1024,
      });
      expect(result.success).toBe(false);
    });

    it("should reject FILE message with empty fileName", () => {
      const result = chatRoomMessageSchema.safeParse({
        type: "FILE",
        chatRoomId: "room-1",
        fileUrl: "https://example.com/file.pdf",
        fileName: "",
        fileSize: 1024,
      });
      expect(result.success).toBe(false);
    });

    it("should reject FILE message with oversized file", () => {
      const result = chatRoomMessageSchema.safeParse({
        type: "FILE",
        chatRoomId: "room-1",
        fileUrl: "https://example.com/file.pdf",
        fileName: "file.pdf",
        fileSize: 101 * 1024 * 1024,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("invalid type", () => {
    it("should reject an unknown message type", () => {
      const result = chatRoomMessageSchema.safeParse({
        type: "IMAGE",
        chatRoomId: "room-1",
        content: "Hello",
      });
      expect(result.success).toBe(false);
    });
  });
});
