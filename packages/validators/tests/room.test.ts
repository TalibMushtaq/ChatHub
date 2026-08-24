import { describe, it, expect } from "vitest";
import {
  createRoomSchema,
  updateRoomSchema,
  createCategorySchema,
  updateCategorySchema,
  createChannelSchema,
  updateChannelSchema,
  channelNameSchema,
  channelTypeSchema,
  reorderSchema,
  channelReorderSchema,
  sendInvitationSchema,
  respondInvitationSchema,
  joinRequestActionSchema,
  createJoinLinkSchema,
  markReadSchema,
  assignableRoleSchema,
  changeMemberRoleSchema,
  banMemberSchema,
  muteMemberSchema,
  setNicknameSchema,
  roomNotificationPrefSchema,
  roomIdParamSchema,
  categoryIdParamSchema,
  channelIdParamSchema,
  memberUserIdParamSchema,
  normalizeChannelName,
  joinRequestStatusQuerySchema,
  roomAvatarKeySchema,
} from "../src/room";

// ---------------------------------------------------------------------------
// createRoomSchema
// ---------------------------------------------------------------------------
describe("createRoomSchema", () => {
  it("accepts valid room with all fields", () => {
    const result = createRoomSchema.safeParse({
      name: "My Room",
      description: "A cool room",
      avatarKey: "defaults/room/default.png",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid room with only name", () => {
    const result = createRoomSchema.safeParse({ name: "My Room" });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = createRoomSchema.safeParse({ description: "desc" });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = createRoomSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name over 100 chars", () => {
    const result = createRoomSchema.safeParse({ name: "a".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("accepts name at exactly 100 chars", () => {
    const result = createRoomSchema.safeParse({ name: "a".repeat(100) });
    expect(result.success).toBe(true);
  });

  it("rejects description over 500 chars", () => {
    const result = createRoomSchema.safeParse({
      name: "Room",
      description: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from name", () => {
    const result = createRoomSchema.parse({ name: "  My Room  " });
    expect(result.name).toBe("My Room");
  });

  it("rejects invalid avatarKey format", () => {
    const result = createRoomSchema.safeParse({
      name: "Room",
      avatarKey: "bad-key",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateRoomSchema
// ---------------------------------------------------------------------------
describe("updateRoomSchema", () => {
  it("accepts partial update with name only", () => {
    const result = updateRoomSchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updateRoomSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts null description", () => {
    const result = updateRoomSchema.safeParse({
      description: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts room avatar key", () => {
    const result = updateRoomSchema.safeParse({
      avatarKey: "avatars/rooms/abc123/photo.jpg",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createCategorySchema
// ---------------------------------------------------------------------------
describe("createCategorySchema", () => {
  it("accepts valid category name", () => {
    const result = createCategorySchema.safeParse({ name: "General" });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = createCategorySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = createCategorySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name over 100 chars", () => {
    const result = createCategorySchema.safeParse({ name: "a".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("trims whitespace", () => {
    const result = createCategorySchema.parse({ name: "  General  " });
    expect(result.name).toBe("General");
  });
});

// ---------------------------------------------------------------------------
// updateCategorySchema
// ---------------------------------------------------------------------------
describe("updateCategorySchema", () => {
  it("accepts partial update with name only", () => {
    const result = updateCategorySchema.safeParse({ name: "New" });
    expect(result.success).toBe(true);
  });

  it("accepts position only", () => {
    const result = updateCategorySchema.safeParse({ position: 0 });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updateCategorySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects negative position", () => {
    const result = updateCategorySchema.safeParse({ position: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer position", () => {
    const result = updateCategorySchema.safeParse({ position: 1.5 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// channelNameSchema
// ---------------------------------------------------------------------------
describe("channelNameSchema", () => {
  it("accepts valid channel name", () => {
    const result = channelNameSchema.safeParse("general");
    expect(result.success).toBe(true);
  });

  it("normalizes spaces to hyphens", () => {
    const result = channelNameSchema.parse("hello world");
    expect(result).toBe("hello-world");
  });

  it("normalizes underscores to hyphens", () => {
    const result = channelNameSchema.parse("hello_world");
    expect(result).toBe("hello-world");
  });

  it("collapses multiple hyphens", () => {
    const result = channelNameSchema.parse("hello---world");
    expect(result).toBe("hello-world");
  });

  it("trims leading/trailing hyphens", () => {
    const result = channelNameSchema.parse("-hello-");
    expect(result).toBe("hello");
  });

  it("lowercases input", () => {
    const result = channelNameSchema.parse("HELLO");
    expect(result).toBe("hello");
  });

  it("rejects single character after normalization", () => {
    const result = channelNameSchema.safeParse("a");
    expect(result.success).toBe(false);
  });

  it("rejects names over 32 chars before normalization", () => {
    const result = channelNameSchema.safeParse("a".repeat(33));
    expect(result.success).toBe(false);
  });

  it("rejects special characters", () => {
    const result = channelNameSchema.safeParse("hello!world");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// channelTypeSchema
// ---------------------------------------------------------------------------
describe("channelTypeSchema", () => {
  it("accepts TEXT", () => {
    const result = channelTypeSchema.safeParse("TEXT");
    expect(result.success).toBe(true);
  });

  it("accepts VOICE", () => {
    const result = channelTypeSchema.safeParse("VOICE");
    expect(result.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const result = channelTypeSchema.safeParse("VIDEO");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createChannelSchema
// ---------------------------------------------------------------------------
describe("createChannelSchema", () => {
  it("accepts valid channel with all fields", () => {
    const result = createChannelSchema.safeParse({
      name: "my-channel",
      type: "VOICE",
      topic: "A channel",
      categoryId: "cat123",
    });
    expect(result.success).toBe(true);
  });

  it("defaults type to TEXT", () => {
    const result = createChannelSchema.parse({ name: "my-channel" });
    expect(result.type).toBe("TEXT");
  });

  it("normalizes name", () => {
    const result = createChannelSchema.parse({ name: "My Channel" });
    expect(result.name).toBe("my-channel");
  });

  it("accepts null topic", () => {
    const result = createChannelSchema.safeParse({
      name: "ch",
      topic: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects topic over 200 chars", () => {
    const result = createChannelSchema.safeParse({
      name: "ch",
      topic: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateChannelSchema
// ---------------------------------------------------------------------------
describe("updateChannelSchema", () => {
  it("accepts empty object", () => {
    const result = updateChannelSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts name update", () => {
    const result = updateChannelSchema.safeParse({ name: "new-name" });
    expect(result.success).toBe(true);
  });

  it("accepts position", () => {
    const result = updateChannelSchema.safeParse({ position: 5 });
    expect(result.success).toBe(true);
  });

  it("rejects negative position", () => {
    const result = updateChannelSchema.safeParse({ position: -1 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reorderSchema
// ---------------------------------------------------------------------------
describe("reorderSchema", () => {
  it("accepts valid ordered ids", () => {
    const result = reorderSchema.safeParse({ orderedIds: ["a", "b", "c"] });
    expect(result.success).toBe(true);
  });

  it("rejects empty array", () => {
    const result = reorderSchema.safeParse({ orderedIds: [] });
    expect(result.success).toBe(false);
  });

  it("rejects empty string ids", () => {
    const result = reorderSchema.safeParse({ orderedIds: [""] });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// channelReorderSchema
// ---------------------------------------------------------------------------
describe("channelReorderSchema", () => {
  it("accepts valid items", () => {
    const result = channelReorderSchema.safeParse({
      items: [
        { id: "ch1", categoryId: "cat1" },
        { id: "ch2", categoryId: null },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty items array", () => {
    const result = channelReorderSchema.safeParse({ items: [] });
    expect(result.success).toBe(false);
  });

  it("rejects items with empty id", () => {
    const result = channelReorderSchema.safeParse({
      items: [{ id: "", categoryId: "cat1" }],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sendInvitationSchema
// ---------------------------------------------------------------------------
describe("sendInvitationSchema", () => {
  it("accepts valid user id", () => {
    const result = sendInvitationSchema.safeParse({ targetUserId: "user123" });
    expect(result.success).toBe(true);
  });

  it("rejects missing targetUserId", () => {
    const result = sendInvitationSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty targetUserId", () => {
    const result = sendInvitationSchema.safeParse({ targetUserId: "" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// respondInvitationSchema
// ---------------------------------------------------------------------------
describe("respondInvitationSchema", () => {
  it("accepts ACCEPTED", () => {
    const result = respondInvitationSchema.safeParse({ status: "ACCEPTED" });
    expect(result.success).toBe(true);
  });

  it("accepts REJECTED", () => {
    const result = respondInvitationSchema.safeParse({ status: "REJECTED" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = respondInvitationSchema.safeParse({ status: "PENDING" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// joinRequestActionSchema
// ---------------------------------------------------------------------------
describe("joinRequestActionSchema", () => {
  it("accepts APPROVED", () => {
    const result = joinRequestActionSchema.safeParse({ action: "APPROVED" });
    expect(result.success).toBe(true);
  });

  it("accepts REJECTED", () => {
    const result = joinRequestActionSchema.safeParse({ action: "REJECTED" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid action", () => {
    const result = joinRequestActionSchema.safeParse({ action: "PENDING" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createJoinLinkSchema
// ---------------------------------------------------------------------------
describe("createJoinLinkSchema", () => {
  it("accepts valid maxUses", () => {
    const result = createJoinLinkSchema.safeParse({ maxUses: 5 });
    expect(result.success).toBe(true);
  });

  it("accepts valid expiresAt", () => {
    const result = createJoinLinkSchema.safeParse({
      expiresAt: "2025-12-31T23:59:59.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = createJoinLinkSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects zero maxUses", () => {
    const result = createJoinLinkSchema.safeParse({ maxUses: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative maxUses", () => {
    const result = createJoinLinkSchema.safeParse({ maxUses: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer maxUses", () => {
    const result = createJoinLinkSchema.safeParse({ maxUses: 1.5 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid expiresAt", () => {
    const result = createJoinLinkSchema.safeParse({
      expiresAt: "not-a-date",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// joinRequestStatusQuerySchema
// ---------------------------------------------------------------------------
describe("joinRequestStatusQuerySchema", () => {
  it("accepts valid status", () => {
    const result = joinRequestStatusQuerySchema.safeParse({
      status: "PENDING",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = joinRequestStatusQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = joinRequestStatusQuerySchema.safeParse({
      status: "INVALID",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// markReadSchema
// ---------------------------------------------------------------------------
describe("markReadSchema", () => {
  it("accepts valid message id", () => {
    const result = markReadSchema.safeParse({ lastReadMessageId: "msg1" });
    expect(result.success).toBe(true);
  });

  it("rejects missing lastReadMessageId", () => {
    const result = markReadSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty lastReadMessageId", () => {
    const result = markReadSchema.safeParse({ lastReadMessageId: "" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assignableRoleSchema
// ---------------------------------------------------------------------------
describe("assignableRoleSchema", () => {
  it("accepts ADMIN", () => {
    const result = assignableRoleSchema.safeParse("ADMIN");
    expect(result.success).toBe(true);
  });

  it("accepts MODERATOR", () => {
    const result = assignableRoleSchema.safeParse("MODERATOR");
    expect(result.success).toBe(true);
  });

  it("accepts MEMBER", () => {
    const result = assignableRoleSchema.safeParse("MEMBER");
    expect(result.success).toBe(true);
  });

  it("rejects OWNER", () => {
    const result = assignableRoleSchema.safeParse("OWNER");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// changeMemberRoleSchema
// ---------------------------------------------------------------------------
describe("changeMemberRoleSchema", () => {
  it("accepts valid role", () => {
    const result = changeMemberRoleSchema.safeParse({ role: "ADMIN" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid role", () => {
    const result = changeMemberRoleSchema.safeParse({ role: "OWNER" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// banMemberSchema
// ---------------------------------------------------------------------------
describe("banMemberSchema", () => {
  it("accepts empty object", () => {
    const result = banMemberSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid reason", () => {
    const result = banMemberSchema.safeParse({ reason: "Spamming" });
    expect(result.success).toBe(true);
  });

  it("accepts null reason", () => {
    const result = banMemberSchema.safeParse({ reason: null });
    expect(result.success).toBe(true);
  });

  it("rejects reason over 200 chars", () => {
    const result = banMemberSchema.safeParse({ reason: "a".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("trims reason", () => {
    const result = banMemberSchema.parse({ reason: "  spam  " });
    expect(result.reason).toBe("spam");
  });
});

// ---------------------------------------------------------------------------
// muteMemberSchema
// ---------------------------------------------------------------------------
describe("muteMemberSchema", () => {
  it("accepts valid duration", () => {
    const result = muteMemberSchema.safeParse({ durationMinutes: 30 });
    expect(result.success).toBe(true);
  });

  it("accepts minimum duration (1 minute)", () => {
    const result = muteMemberSchema.safeParse({ durationMinutes: 1 });
    expect(result.success).toBe(true);
  });

  it("accepts maximum duration (43200 minutes = 30 days)", () => {
    const result = muteMemberSchema.safeParse({ durationMinutes: 43200 });
    expect(result.success).toBe(true);
  });

  it("rejects zero duration", () => {
    const result = muteMemberSchema.safeParse({ durationMinutes: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative duration", () => {
    const result = muteMemberSchema.safeParse({ durationMinutes: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects duration over 43200 minutes", () => {
    const result = muteMemberSchema.safeParse({ durationMinutes: 43201 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer duration", () => {
    const result = muteMemberSchema.safeParse({ durationMinutes: 1.5 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setNicknameSchema
// ---------------------------------------------------------------------------
describe("setNicknameSchema", () => {
  it("accepts valid nickname", () => {
    const result = setNicknameSchema.safeParse({ nickname: "CoolNick" });
    expect(result.success).toBe(true);
  });

  it("accepts null nickname", () => {
    const result = setNicknameSchema.safeParse({ nickname: null });
    expect(result.success).toBe(true);
  });

  it("accepts empty string nickname", () => {
    const result = setNicknameSchema.safeParse({ nickname: "" });
    expect(result.success).toBe(true);
  });

  it("rejects nickname over 32 chars", () => {
    const result = setNicknameSchema.safeParse({ nickname: "a".repeat(33) });
    expect(result.success).toBe(false);
  });

  it("trims nickname", () => {
    const result = setNicknameSchema.parse({ nickname: "  Nick  " });
    expect(result.nickname).toBe("Nick");
  });
});

// ---------------------------------------------------------------------------
// roomNotificationPrefSchema
// ---------------------------------------------------------------------------
describe("roomNotificationPrefSchema", () => {
  it("accepts ALL", () => {
    const result = roomNotificationPrefSchema.safeParse({
      notificationPref: "ALL",
    });
    expect(result.success).toBe(true);
  });

  it("accepts MENTIONS", () => {
    const result = roomNotificationPrefSchema.safeParse({
      notificationPref: "MENTIONS",
    });
    expect(result.success).toBe(true);
  });

  it("accepts MUTED", () => {
    const result = roomNotificationPrefSchema.safeParse({
      notificationPref: "MUTED",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid preference", () => {
    const result = roomNotificationPrefSchema.safeParse({
      notificationPref: "NONE",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// roomAvatarKeySchema
// ---------------------------------------------------------------------------
describe("roomAvatarKeySchema", () => {
  it("accepts default room avatar", () => {
    const result = roomAvatarKeySchema.safeParse("defaults/room/default.png");
    expect(result.success).toBe(true);
  });

  it("accepts uploaded room avatar", () => {
    const result = roomAvatarKeySchema.safeParse(
      "avatars/rooms/abc123/photo.jpg",
    );
    expect(result.success).toBe(true);
  });

  it("rejects invalid default avatar extension", () => {
    const result = roomAvatarKeySchema.safeParse("defaults/room/default.jpg");
    expect(result.success).toBe(false);
  });

  it("rejects missing room id in uploaded avatar", () => {
    const result = roomAvatarKeySchema.safeParse("avatars/rooms//photo.jpg");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
describe("roomIdParamSchema", () => {
  it("accepts valid roomId", () => {
    const result = roomIdParamSchema.safeParse({ roomId: "abc" });
    expect(result.success).toBe(true);
  });

  it("rejects empty roomId", () => {
    const result = roomIdParamSchema.safeParse({ roomId: "" });
    expect(result.success).toBe(false);
  });
});

describe("categoryIdParamSchema", () => {
  it("accepts valid categoryId", () => {
    const result = categoryIdParamSchema.safeParse({ categoryId: "abc" });
    expect(result.success).toBe(true);
  });

  it("rejects empty categoryId", () => {
    const result = categoryIdParamSchema.safeParse({ categoryId: "" });
    expect(result.success).toBe(false);
  });
});

describe("channelIdParamSchema", () => {
  it("accepts valid channelId", () => {
    const result = channelIdParamSchema.safeParse({ channelId: "abc" });
    expect(result.success).toBe(true);
  });

  it("rejects empty channelId", () => {
    const result = channelIdParamSchema.safeParse({ channelId: "" });
    expect(result.success).toBe(false);
  });
});

describe("memberUserIdParamSchema", () => {
  it("accepts valid userId", () => {
    const result = memberUserIdParamSchema.safeParse({ userId: "abc" });
    expect(result.success).toBe(true);
  });

  it("rejects empty userId", () => {
    const result = memberUserIdParamSchema.safeParse({ userId: "" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeChannelName
// ---------------------------------------------------------------------------
describe("normalizeChannelName", () => {
  it("converts to lowercase", () => {
    expect(normalizeChannelName("HELLO")).toBe("hello");
  });

  it("replaces spaces with hyphens", () => {
    expect(normalizeChannelName("hello world")).toBe("hello-world");
  });

  it("replaces underscores with hyphens", () => {
    expect(normalizeChannelName("hello_world")).toBe("hello-world");
  });

  it("collapses multiple hyphens", () => {
    expect(normalizeChannelName("hello---world")).toBe("hello-world");
  });

  it("trims leading/trailing hyphens", () => {
    expect(normalizeChannelName("-hello-")).toBe("hello");
  });

  it("trims whitespace", () => {
    expect(normalizeChannelName("  hello  ")).toBe("hello");
  });
});
