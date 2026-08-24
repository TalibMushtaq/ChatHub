import { describe, it, expect } from "vitest";
import {
  chatRoomMessageSchema,
  chatRoomEditMessageSchema,
  chatRoomDeleteMessageSchema,
  chatRoomTypingSchema,
  MAX_ROOM_MESSAGE_LENGTH,
} from "../src/roomChat";

// ---------------------------------------------------------------------------
// chatRoomMessageSchema
// ---------------------------------------------------------------------------
describe("chatRoomMessageSchema", () => {
  it("accepts valid TEXT message", () => {
    const result = chatRoomMessageSchema.safeParse({
      roomId: "room1",
      content: "Hello!",
      messageType: "TEXT",
    });
    expect(result.success).toBe(true);
  });

  it("rejects TEXT message without content", () => {
    const result = chatRoomMessageSchema.safeParse({
      roomId: "room1",
      messageType: "TEXT",
    });
    expect(result.success).toBe(false);
  });

  it("rejects TEXT message with empty content", () => {
    const result = chatRoomMessageSchema.safeParse({
      roomId: "room1",
      content: "   ",
      messageType: "TEXT",
    });
    expect(result.success).toBe(false);
  });

  it("rejects TEXT message with attachments", () => {
    const result = chatRoomMessageSchema.safeParse({
      roomId: "room1",
      content: "Hello",
      messageType: "TEXT",
      attachmentIds: ["att1"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts IMAGE message with attachments", () => {
    const result = chatRoomMessageSchema.safeParse({
      roomId: "room1",
      messageType: "IMAGE",
      attachmentIds: ["att1"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects IMAGE message without attachments", () => {
    const result = chatRoomMessageSchema.safeParse({
      roomId: "room1",
      messageType: "IMAGE",
    });
    expect(result.success).toBe(false);
  });

  it("accepts VIDEO message with exactly 1 attachment", () => {
    const result = chatRoomMessageSchema.safeParse({
      roomId: "room1",
      messageType: "VIDEO",
      attachmentIds: ["att1"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects VIDEO message with 2 attachments", () => {
    const result = chatRoomMessageSchema.safeParse({
      roomId: "room1",
      messageType: "VIDEO",
      attachmentIds: ["att1", "att2"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts VOICE message with exactly 1 attachment", () => {
    const result = chatRoomMessageSchema.safeParse({
      roomId: "room1",
      messageType: "VOICE",
      attachmentIds: ["att1"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts AUDIO message with 1+ attachments", () => {
    const result = chatRoomMessageSchema.safeParse({
      roomId: "room1",
      messageType: "AUDIO",
      attachmentIds: ["att1", "att2"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts FILE message with 1+ attachments", () => {
    const result = chatRoomMessageSchema.safeParse({
      roomId: "room1",
      messageType: "FILE",
      attachmentIds: ["att1"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing roomId", () => {
    const result = chatRoomMessageSchema.safeParse({
      content: "Hello",
      messageType: "TEXT",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid messageType", () => {
    const result = chatRoomMessageSchema.safeParse({
      roomId: "room1",
      content: "Hello",
      messageType: "SYSTEM",
    });
    expect(result.success).toBe(false);
  });

  it("accepts content at max length", () => {
    const result = chatRoomMessageSchema.safeParse({
      roomId: "room1",
      content: "a".repeat(MAX_ROOM_MESSAGE_LENGTH),
      messageType: "TEXT",
    });
    expect(result.success).toBe(true);
  });

  it("rejects content over max length", () => {
    const result = chatRoomMessageSchema.safeParse({
      roomId: "room1",
      content: "a".repeat(MAX_ROOM_MESSAGE_LENGTH + 1),
      messageType: "TEXT",
    });
    expect(result.success).toBe(false);
  });

  it("accepts up to 10 attachments", () => {
    const result = chatRoomMessageSchema.safeParse({
      roomId: "room1",
      messageType: "FILE",
      attachmentIds: Array.from({ length: 10 }, (_, i) => `att${i}`),
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 10 attachments", () => {
    const result = chatRoomMessageSchema.safeParse({
      roomId: "room1",
      messageType: "FILE",
      attachmentIds: Array.from({ length: 11 }, (_, i) => `att${i}`),
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional channelId", () => {
    const result = chatRoomMessageSchema.safeParse({
      roomId: "room1",
      channelId: "ch1",
      content: "Hello",
      messageType: "TEXT",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional idempotencyKey", () => {
    const result = chatRoomMessageSchema.safeParse({
      roomId: "room1",
      content: "Hello",
      messageType: "TEXT",
      idempotencyKey: "key123",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// chatRoomEditMessageSchema
// ---------------------------------------------------------------------------
describe("chatRoomEditMessageSchema", () => {
  it("accepts valid edit payload", () => {
    const result = chatRoomEditMessageSchema.safeParse({
      roomId: "room1",
      messageId: "msg1",
      content: "Updated content",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing roomId", () => {
    const result = chatRoomEditMessageSchema.safeParse({
      messageId: "msg1",
      content: "Updated",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing messageId", () => {
    const result = chatRoomEditMessageSchema.safeParse({
      roomId: "room1",
      content: "Updated",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty content", () => {
    const result = chatRoomEditMessageSchema.safeParse({
      roomId: "room1",
      messageId: "msg1",
      content: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects content over max length", () => {
    const result = chatRoomEditMessageSchema.safeParse({
      roomId: "room1",
      messageId: "msg1",
      content: "a".repeat(MAX_ROOM_MESSAGE_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// chatRoomDeleteMessageSchema
// ---------------------------------------------------------------------------
describe("chatRoomDeleteMessageSchema", () => {
  it("accepts valid delete payload", () => {
    const result = chatRoomDeleteMessageSchema.safeParse({
      roomId: "room1",
      messageId: "msg1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing roomId", () => {
    const result = chatRoomDeleteMessageSchema.safeParse({
      messageId: "msg1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing messageId", () => {
    const result = chatRoomDeleteMessageSchema.safeParse({
      roomId: "room1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty fields", () => {
    const result = chatRoomDeleteMessageSchema.safeParse({
      roomId: "",
      messageId: "",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// chatRoomTypingSchema
// ---------------------------------------------------------------------------
describe("chatRoomTypingSchema", () => {
  it("accepts typing true", () => {
    const result = chatRoomTypingSchema.safeParse({
      roomId: "room1",
      isTyping: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts typing false", () => {
    const result = chatRoomTypingSchema.safeParse({
      roomId: "room1",
      isTyping: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing roomId", () => {
    const result = chatRoomTypingSchema.safeParse({ isTyping: true });
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean isTyping", () => {
    const result = chatRoomTypingSchema.safeParse({
      roomId: "room1",
      isTyping: "yes",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing isTyping", () => {
    const result = chatRoomTypingSchema.safeParse({ roomId: "room1" });
    expect(result.success).toBe(false);
  });
});
