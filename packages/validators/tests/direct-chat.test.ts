import { describe, it, expect } from "vitest";
import {
  startDmSchema,
  sendMessageSchema,
  getMessagesSchema,
  editMessageSchema,
  messageIdParamSchema,
  directChatIdParamSchema,
  directChatTypingSchema,
  getInboxQuerySchema,
  MAX_MESSAGE_LENGTH,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from "../src/direct-chat";

// ---------------------------------------------------------------------------
// startDmSchema
// ---------------------------------------------------------------------------
describe("startDmSchema", () => {
  it("accepts valid userId", () => {
    const result = startDmSchema.safeParse({ userId: "user123" });
    expect(result.success).toBe(true);
  });

  it("rejects missing userId", () => {
    const result = startDmSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty userId", () => {
    const result = startDmSchema.safeParse({ userId: "" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sendMessageSchema
// ---------------------------------------------------------------------------
describe("sendMessageSchema", () => {
  it("accepts valid TEXT message", () => {
    const result = sendMessageSchema.safeParse({
      content: "Hello!",
      messageType: "TEXT",
    });
    expect(result.success).toBe(true);
  });

  it("rejects TEXT message without content", () => {
    const result = sendMessageSchema.safeParse({
      messageType: "TEXT",
    });
    expect(result.success).toBe(false);
  });

  it("rejects TEXT message with empty content", () => {
    const result = sendMessageSchema.safeParse({
      content: "   ",
      messageType: "TEXT",
    });
    expect(result.success).toBe(false);
  });

  it("rejects TEXT message with attachments", () => {
    const result = sendMessageSchema.safeParse({
      content: "Hello",
      messageType: "TEXT",
      attachmentIds: ["att1"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts IMAGE message with attachment", () => {
    const result = sendMessageSchema.safeParse({
      messageType: "IMAGE",
      attachmentIds: ["att1"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects IMAGE message without attachments", () => {
    const result = sendMessageSchema.safeParse({
      messageType: "IMAGE",
    });
    expect(result.success).toBe(false);
  });

  it("accepts VIDEO message with exactly 1 attachment", () => {
    const result = sendMessageSchema.safeParse({
      messageType: "VIDEO",
      attachmentIds: ["att1"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects VIDEO message with 2 attachments", () => {
    const result = sendMessageSchema.safeParse({
      messageType: "VIDEO",
      attachmentIds: ["att1", "att2"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts VOICE message with exactly 1 attachment", () => {
    const result = sendMessageSchema.safeParse({
      messageType: "VOICE",
      attachmentIds: ["att1"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts AUDIO message with 1+ attachments", () => {
    const result = sendMessageSchema.safeParse({
      messageType: "AUDIO",
      attachmentIds: ["att1"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts FILE message with 1+ attachments", () => {
    const result = sendMessageSchema.safeParse({
      messageType: "FILE",
      attachmentIds: ["att1", "att2"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts content at max length", () => {
    const result = sendMessageSchema.safeParse({
      content: "a".repeat(MAX_MESSAGE_LENGTH),
      messageType: "TEXT",
    });
    expect(result.success).toBe(true);
  });

  it("rejects content over max length", () => {
    const result = sendMessageSchema.safeParse({
      content: "a".repeat(MAX_MESSAGE_LENGTH + 1),
      messageType: "TEXT",
    });
    expect(result.success).toBe(false);
  });

  it("accepts up to MAX_ATTACHMENTS_PER_MESSAGE", () => {
    const result = sendMessageSchema.safeParse({
      messageType: "FILE",
      attachmentIds: Array.from(
        { length: MAX_ATTACHMENTS_PER_MESSAGE },
        (_, i) => `att${i}`,
      ),
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than MAX_ATTACHMENTS_PER_MESSAGE", () => {
    const result = sendMessageSchema.safeParse({
      messageType: "FILE",
      attachmentIds: Array.from(
        { length: MAX_ATTACHMENTS_PER_MESSAGE + 1 },
        (_, i) => `att${i}`,
      ),
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional idempotencyKey", () => {
    const result = sendMessageSchema.safeParse({
      content: "Hello",
      messageType: "TEXT",
      idempotencyKey: "key123",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getMessagesSchema
// ---------------------------------------------------------------------------
describe("getMessagesSchema", () => {
  it("accepts empty object", () => {
    const result = getMessagesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid cursor", () => {
    const result = getMessagesSchema.safeParse({ cursor: "abc" });
    expect(result.success).toBe(true);
  });

  it("accepts limit as string (coerced)", () => {
    const result = getMessagesSchema.safeParse({ limit: "50" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(50);
  });

  it("accepts limit at min (1)", () => {
    const result = getMessagesSchema.safeParse({ limit: "1" });
    expect(result.success).toBe(true);
  });

  it("accepts limit at max (100)", () => {
    const result = getMessagesSchema.safeParse({ limit: "100" });
    expect(result.success).toBe(true);
  });

  it("rejects limit below 1", () => {
    const result = getMessagesSchema.safeParse({ limit: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects limit above 100", () => {
    const result = getMessagesSchema.safeParse({ limit: "101" });
    expect(result.success).toBe(false);
  });

  it("accepts direction before", () => {
    const result = getMessagesSchema.safeParse({ direction: "before" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid direction", () => {
    const result = getMessagesSchema.safeParse({ direction: "after" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// editMessageSchema
// ---------------------------------------------------------------------------
describe("editMessageSchema", () => {
  it("accepts valid content", () => {
    const result = editMessageSchema.safeParse({ content: "Updated" });
    expect(result.success).toBe(true);
  });

  it("rejects empty content", () => {
    const result = editMessageSchema.safeParse({ content: "" });
    expect(result.success).toBe(false);
  });

  it("rejects content over max length", () => {
    const result = editMessageSchema.safeParse({
      content: "a".repeat(MAX_MESSAGE_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it("trims whitespace", () => {
    const result = editMessageSchema.parse({ content: "  Updated  " });
    expect(result.content).toBe("Updated");
  });
});

// ---------------------------------------------------------------------------
// messageIdParamSchema
// ---------------------------------------------------------------------------
describe("messageIdParamSchema", () => {
  it("accepts valid messageId", () => {
    const result = messageIdParamSchema.safeParse({ messageId: "msg1" });
    expect(result.success).toBe(true);
  });

  it("rejects empty messageId", () => {
    const result = messageIdParamSchema.safeParse({ messageId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing messageId", () => {
    const result = messageIdParamSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// directChatIdParamSchema
// ---------------------------------------------------------------------------
describe("directChatIdParamSchema", () => {
  it("accepts valid directChatId", () => {
    const result = directChatIdParamSchema.safeParse({ directChatId: "dc1" });
    expect(result.success).toBe(true);
  });

  it("rejects empty directChatId", () => {
    const result = directChatIdParamSchema.safeParse({ directChatId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing directChatId", () => {
    const result = directChatIdParamSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// directChatTypingSchema
// ---------------------------------------------------------------------------
describe("directChatTypingSchema", () => {
  it("accepts typing true", () => {
    const result = directChatTypingSchema.safeParse({
      directChatId: "dc1",
      isTyping: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts typing false", () => {
    const result = directChatTypingSchema.safeParse({
      directChatId: "dc1",
      isTyping: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing directChatId", () => {
    const result = directChatTypingSchema.safeParse({ isTyping: true });
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean isTyping", () => {
    const result = directChatTypingSchema.safeParse({
      directChatId: "dc1",
      isTyping: "yes",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getInboxQuerySchema
// ---------------------------------------------------------------------------
describe("getInboxQuerySchema", () => {
  it("accepts empty object", () => {
    const result = getInboxQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid cursor", () => {
    const result = getInboxQuerySchema.safeParse({ cursor: "abc" });
    expect(result.success).toBe(true);
  });

  it("accepts limit as string (coerced)", () => {
    const result = getInboxQuerySchema.safeParse({ limit: "25" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(25);
  });

  it("accepts limit at min (1)", () => {
    const result = getInboxQuerySchema.safeParse({ limit: "1" });
    expect(result.success).toBe(true);
  });

  it("accepts limit at max (50)", () => {
    const result = getInboxQuerySchema.safeParse({ limit: "50" });
    expect(result.success).toBe(true);
  });

  it("rejects limit below 1", () => {
    const result = getInboxQuerySchema.safeParse({ limit: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects limit above 50", () => {
    const result = getInboxQuerySchema.safeParse({ limit: "51" });
    expect(result.success).toBe(false);
  });
});
