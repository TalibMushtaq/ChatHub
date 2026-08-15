import { describe, it, expect } from "vitest";
import {
  buildPushPayload,
  notificationBody,
} from "../../../../src/services/push/payload";

describe("notificationBody", () => {
  it("returns a generic preview for media messages", () => {
    expect(
      notificationBody({ messageType: "IMAGE", content: "photo.jpg" }),
    ).toBe("[Photo]");
    expect(
      notificationBody({ messageType: "VOICE", content: "clip.m4a" }),
    ).toBe("[Voice message]");
    expect(
      notificationBody({ messageType: "FILE", content: "notes.pdf" }),
    ).toBe("[File]");
  });

  it("truncates long text at 140 chars", () => {
    const long = "a".repeat(200);
    const body = notificationBody({ messageType: "TEXT", content: long });
    expect(body).toBe(`${"a".repeat(140)}…`);
    expect(body.length).toBe(141);
  });

  it("falls back to a placeholder for empty text", () => {
    expect(notificationBody({ messageType: "TEXT", content: "   " })).toBe(
      "[Message]",
    );
    expect(notificationBody({ messageType: "TEXT", content: null })).toBe(
      "[Message]",
    );
  });
});

describe("buildPushPayload", () => {
  it("builds a room title with sender + room and navigation data", () => {
    const p = buildPushPayload({
      kind: "room",
      conversationId: "r1",
      messageId: "m1",
      senderName: "Bob",
      roomName: "Games",
      messageType: "TEXT",
      content: "hello",
    });

    expect(p.title).toBe("Bob in #Games");
    expect(p.body).toBe("hello");
    expect(p.tag).toBe("chathubby:m1");
    expect(p.data).toEqual({
      kind: "room",
      conversationId: "r1",
      messageId: "m1",
    });
    expect(p.icon).toBe("/chathubby-v2.webp");
  });

  it("uses the sender name alone for DMs and a generic preview for media", () => {
    const p = buildPushPayload({
      kind: "dm",
      conversationId: "d1",
      messageId: "m2",
      senderName: "Alice",
      messageType: "IMAGE",
      content: null,
    });

    expect(p.title).toBe("Alice");
    expect(p.body).toBe("[Photo]");
  });
});
