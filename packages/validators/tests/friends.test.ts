import { describe, it, expect } from "vitest";
import {
  sendFriendRequestSchema,
  friendRequestIdParamSchema,
  blockUserIdParamSchema,
  getFriendRequestsQuerySchema,
  getBlockedUsersQuerySchema,
  FRIEND_REQUEST_STATUSES,
  RELATIONSHIP_VALUES,
} from "../src/friends";

// ---------------------------------------------------------------------------
// sendFriendRequestSchema
// ---------------------------------------------------------------------------
describe("sendFriendRequestSchema", () => {
  it("accepts valid userId", () => {
    const result = sendFriendRequestSchema.safeParse({ userId: "user123" });
    expect(result.success).toBe(true);
  });

  it("accepts valid userId with _csrf", () => {
    const result = sendFriendRequestSchema.safeParse({
      userId: "user123",
      _csrf: "token",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing userId", () => {
    const result = sendFriendRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty userId", () => {
    const result = sendFriendRequestSchema.safeParse({ userId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (strict)", () => {
    const result = sendFriendRequestSchema.safeParse({
      userId: "user123",
      recipientId: "other",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// friendRequestIdParamSchema
// ---------------------------------------------------------------------------
describe("friendRequestIdParamSchema", () => {
  it("accepts valid requestId", () => {
    const result = friendRequestIdParamSchema.safeParse({ requestId: "req1" });
    expect(result.success).toBe(true);
  });

  it("rejects empty requestId", () => {
    const result = friendRequestIdParamSchema.safeParse({ requestId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing requestId", () => {
    const result = friendRequestIdParamSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// blockUserIdParamSchema
// ---------------------------------------------------------------------------
describe("blockUserIdParamSchema", () => {
  it("accepts valid userId", () => {
    const result = blockUserIdParamSchema.safeParse({ userId: "user123" });
    expect(result.success).toBe(true);
  });

  it("rejects empty userId", () => {
    const result = blockUserIdParamSchema.safeParse({ userId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing userId", () => {
    const result = blockUserIdParamSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getFriendRequestsQuerySchema
// ---------------------------------------------------------------------------
describe("getFriendRequestsQuerySchema", () => {
  it("accepts empty object", () => {
    const result = getFriendRequestsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid cursor", () => {
    const result = getFriendRequestsQuerySchema.safeParse({ cursor: "abc" });
    expect(result.success).toBe(true);
  });

  it("accepts limit as string (coerced)", () => {
    const result = getFriendRequestsQuerySchema.safeParse({ limit: "25" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(25);
  });

  it("accepts limit at min (1)", () => {
    const result = getFriendRequestsQuerySchema.safeParse({ limit: "1" });
    expect(result.success).toBe(true);
  });

  it("accepts limit at max (50)", () => {
    const result = getFriendRequestsQuerySchema.safeParse({ limit: "50" });
    expect(result.success).toBe(true);
  });

  it("rejects limit below 1", () => {
    const result = getFriendRequestsQuerySchema.safeParse({ limit: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects limit above 50", () => {
    const result = getFriendRequestsQuerySchema.safeParse({ limit: "51" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getBlockedUsersQuerySchema
// ---------------------------------------------------------------------------
describe("getBlockedUsersQuerySchema", () => {
  it("accepts empty object", () => {
    const result = getBlockedUsersQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid cursor", () => {
    const result = getBlockedUsersQuerySchema.safeParse({ cursor: "abc" });
    expect(result.success).toBe(true);
  });

  it("accepts limit as string (coerced)", () => {
    const result = getBlockedUsersQuerySchema.safeParse({ limit: "10" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(10);
  });

  it("accepts limit at min (1)", () => {
    const result = getBlockedUsersQuerySchema.safeParse({ limit: "1" });
    expect(result.success).toBe(true);
  });

  it("accepts limit at max (50)", () => {
    const result = getBlockedUsersQuerySchema.safeParse({ limit: "50" });
    expect(result.success).toBe(true);
  });

  it("rejects limit below 1", () => {
    const result = getBlockedUsersQuerySchema.safeParse({ limit: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects limit above 50", () => {
    const result = getBlockedUsersQuerySchema.safeParse({ limit: "51" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("FRIEND_REQUEST_STATUSES", () => {
  it("contains expected values", () => {
    expect(FRIEND_REQUEST_STATUSES).toEqual([
      "PENDING",
      "ACCEPTED",
      "DECLINED",
    ]);
  });
});

describe("RELATIONSHIP_VALUES", () => {
  it("contains expected values", () => {
    expect(RELATIONSHIP_VALUES).toEqual([
      "NONE",
      "REQUEST_SENT",
      "REQUEST_RECEIVED",
      "FRIENDS",
      "BLOCKED",
    ]);
  });
});
