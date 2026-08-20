import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractMentionedUsernames,
  createMessageMentions,
} from "../../../../src/services/room/mentions";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

describe("extractMentionedUsernames", () => {
  it("returns an empty array for null/undefined/empty content", () => {
    expect(extractMentionedUsernames(null)).toEqual([]);
    expect(extractMentionedUsernames(undefined)).toEqual([]);
    expect(extractMentionedUsernames("")).toEqual([]);
  });

  it("extracts distinct @username tokens", () => {
    expect(
      extractMentionedUsernames("hey @alice and @bob, look at this"),
    ).toEqual(["alice", "bob"]);
  });

  it("ignores @ inside emails and existing words", () => {
    expect(extractMentionedUsernames("mail me at foo@bar.com")).toEqual([]);
    expect(extractMentionedUsernames("retweeted@bob nah")).toEqual([]);
    // A path segment like /@ghost still counts: the regex only guards the
    // immediately-preceding character, and `/` is a valid boundary.
    expect(extractMentionedUsernames("visit https://x.io/@ghost")).toEqual([
      "ghost",
    ]);
  });

  it("matches a mention at the start of the content", () => {
    expect(extractMentionedUsernames("@alice hi there")).toEqual(["alice"]);
  });

  it("requires at least 3 characters and caps at 20", () => {
    expect(extractMentionedUsernames("@hi @alice_12")).toEqual(["alice_12"]);
    // A 2-char token is ignored; an over-long token is capped at 20 chars
    // (the cap matches the username length limit, so no real user is hit).
    expect(extractMentionedUsernames("@ab")).toEqual([]);
    expect(
      extractMentionedUsernames("@aaaaaaaaaaaaaaaaaaaaa_21chars_way_too_long"),
    ).toEqual(["aaaaaaaaaaaaaaaaaaaa"]);
  });

  it("deduplicates repeated mentions of the same user", () => {
    expect(extractMentionedUsernames("@alice ... @alice again")).toEqual([
      "alice",
    ]);
  });
});

describe("createMessageMentions", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("is a no-op when the content has no mentions", async () => {
    const result = await createMessageMentions({
      messageId: "m1",
      roomId: "room1",
      channelId: "ch1",
      senderId: "u1",
      content: "just a normal message",
    });

    expect(result).toEqual([]);
    expect(prismaMock.chatRoomMember.findMany).not.toHaveBeenCalled();
    expect(prismaMock.messageMention.createMany).not.toHaveBeenCalled();
  });

  it("persists mentions for matched members, excluding the sender", async () => {
    prismaMock.chatRoomMember.findMany.mockResolvedValue([
      { userId: "u2", User: { username: "alice" } },
      { userId: "u3", User: { username: "bob" } },
      { userId: "u1", User: { username: "sender" } },
    ] as any);
    prismaMock.messageMention.createMany.mockResolvedValue({ count: 2 } as any);

    const result = await createMessageMentions({
      messageId: "m1",
      roomId: "room1",
      channelId: "ch1",
      senderId: "u1",
      content: "cc @alice and @bob and @sender",
    });

    expect(result).toEqual([
      { userId: "u2", username: "alice" },
      { userId: "u3", username: "bob" },
    ]);
    expect(prismaMock.messageMention.createMany).toHaveBeenCalledWith({
      data: [
        {
          messageId: "m1",
          userId: "u2",
          roomId: "room1",
          channelId: "ch1",
        },
        {
          messageId: "m1",
          userId: "u3",
          roomId: "room1",
          channelId: "ch1",
        },
      ],
      skipDuplicates: true,
    });
  });

  it("returns an empty result when no room members match the usernames", async () => {
    prismaMock.chatRoomMember.findMany.mockResolvedValue([] as any);

    const result = await createMessageMentions({
      messageId: "m1",
      roomId: "room1",
      channelId: "ch1",
      senderId: "u1",
      content: "hey @ghost",
    });

    expect(result).toEqual([]);
    expect(prismaMock.messageMention.createMany).not.toHaveBeenCalled();
  });

  it("excludes the sender when they are the only match", async () => {
    prismaMock.chatRoomMember.findMany.mockResolvedValue([
      { userId: "u1", User: { username: "sender" } },
    ] as any);

    const result = await createMessageMentions({
      messageId: "m1",
      roomId: "room1",
      channelId: "ch1",
      senderId: "u1",
      content: "note to self @sender",
    });

    expect(result).toEqual([]);
    expect(prismaMock.messageMention.createMany).not.toHaveBeenCalled();
  });
});
