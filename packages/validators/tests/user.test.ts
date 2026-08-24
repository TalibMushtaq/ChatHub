import { describe, it, expect } from "vitest";
import {
  userZod,
  searchUsersQuerySchema,
  userIdParamSchema,
  forgotPasswordSchema,
  regenerateRecoveryCodesSchema,
  checkUsernameSchema,
  updateStatusSchema,
  updatePrivacySchema,
  USER_STATUSES,
} from "../src/user";

// ---------------------------------------------------------------------------
// userZod.signup
// ---------------------------------------------------------------------------
describe("userZod.signup", () => {
  it("accepts valid signup", () => {
    const result = userZod.signup.safeParse({
      email: "user@example.com",
      username: "alice",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts signup with displayName", () => {
    const result = userZod.signup.safeParse({
      email: "user@example.com",
      username: "alice",
      password: "password123",
      displayName: "Alice",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing email", () => {
    const result = userZod.signup.safeParse({
      username: "alice",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = userZod.signup.safeParse({
      email: "not-an-email",
      username: "alice",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects username too short", () => {
    const result = userZod.signup.safeParse({
      email: "user@example.com",
      username: "ab",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects username too long", () => {
    const result = userZod.signup.safeParse({
      email: "user@example.com",
      username: "a".repeat(21),
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects username with special characters", () => {
    const result = userZod.signup.safeParse({
      email: "user@example.com",
      username: "user@name",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password too short", () => {
    const result = userZod.signup.safeParse({
      email: "user@example.com",
      username: "alice",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password too long", () => {
    const result = userZod.signup.safeParse({
      email: "user@example.com",
      username: "alice",
      password: "a".repeat(73),
    });
    expect(result.success).toBe(false);
  });

  it("trims email", () => {
    const result = userZod.signup.parse({
      email: "user@example.com",
      username: "alice",
      password: "password123",
    });
    expect(result.email).toBe("user@example.com");
  });

  it("trims username", () => {
    const result = userZod.signup.parse({
      email: "user@example.com",
      username: "  alice  ",
      password: "password123",
    });
    expect(result.username).toBe("alice");
  });
});

// ---------------------------------------------------------------------------
// userZod.login (union)
// ---------------------------------------------------------------------------
describe("userZod.login", () => {
  it("accepts login with email", () => {
    const result = userZod.login.safeParse({
      email: "user@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts login with username", () => {
    const result = userZod.login.safeParse({
      username: "alice",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("matches email branch when both email and username provided", () => {
    const result = userZod.login.safeParse({
      email: "user@example.com",
      username: "alice",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects login without password", () => {
    const result = userZod.login.safeParse({
      email: "user@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects login without email or username", () => {
    const result = userZod.login.safeParse({
      password: "password123",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// userZod.updateMe
// ---------------------------------------------------------------------------
describe("userZod.updateMe", () => {
  it("accepts empty update", () => {
    const result = userZod.updateMe.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial update", () => {
    const result = userZod.updateMe.safeParse({ bio: "New bio" });
    expect(result.success).toBe(true);
  });

  it("accepts password change with both fields", () => {
    const result = userZod.updateMe.safeParse({
      currentPassword: "old12345",
      newPassword: "new12345",
    });
    expect(result.success).toBe(true);
  });

  it("rejects password change with only currentPassword", () => {
    const result = userZod.updateMe.safeParse({
      currentPassword: "old12345",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password change with only newPassword", () => {
    const result = userZod.updateMe.safeParse({
      newPassword: "new12345",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (strict)", () => {
    const result = userZod.updateMe.safeParse({
      username: "hacker",
      bio: "ok",
    });
    expect(result.success).toBe(false);
  });

  it("accepts _csrf field", () => {
    const result = userZod.updateMe.safeParse({
      bio: "ok",
      _csrf: "token123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid fields", () => {
    const result = userZod.updateMe.safeParse({
      displayName: "Alice",
      bio: "Hello",
      gender: "FEMALE",
      dateOfBirth: "2000-01-01",
      currentPassword: "old12345",
      newPassword: "new12345",
      _csrf: "token",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// searchUsersQuerySchema
// ---------------------------------------------------------------------------
describe("searchUsersQuerySchema", () => {
  it("accepts valid query", () => {
    const result = searchUsersQuerySchema.safeParse({ query: "alice" });
    expect(result.success).toBe(true);
  });

  it("defaults limit to 10", () => {
    const result = searchUsersQuerySchema.parse({ query: "alice" });
    expect(result.limit).toBe(10);
  });

  it("rejects query too short", () => {
    const result = searchUsersQuerySchema.safeParse({ query: "a" });
    expect(result.success).toBe(false);
  });

  it("accepts query at max length", () => {
    const result = searchUsersQuerySchema.safeParse({ query: "a".repeat(100) });
    expect(result.success).toBe(true);
  });

  it("rejects query over max length", () => {
    const result = searchUsersQuerySchema.safeParse({ query: "a".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("accepts limit as string", () => {
    const result = searchUsersQuerySchema.safeParse({
      query: "alice",
      limit: "25",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// userIdParamSchema
// ---------------------------------------------------------------------------
describe("userIdParamSchema", () => {
  it("accepts valid UUID", () => {
    const result = userIdParamSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID", () => {
    const result = userIdParamSchema.safeParse({ id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects missing id", () => {
    const result = userIdParamSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// forgotPasswordSchema
// ---------------------------------------------------------------------------
describe("forgotPasswordSchema", () => {
  it("accepts valid recovery code", () => {
    const result = forgotPasswordSchema.safeParse({
      username: "alice",
      recoveryCode: "RC_4A7F8C.JQ8K-H4XT-MP2A",
      newPassword: "newpassword123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid recovery code format", () => {
    const result = forgotPasswordSchema.safeParse({
      username: "alice",
      recoveryCode: "RC_4A7F8C.JQ8K-H4XT-MP2L",
      newPassword: "newpassword123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing username", () => {
    const result = forgotPasswordSchema.safeParse({
      recoveryCode: "RC_4A7F8C.JQ8K-H4XT-MP2L",
      newPassword: "newpassword123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing recoveryCode", () => {
    const result = forgotPasswordSchema.safeParse({
      username: "alice",
      newPassword: "newpassword123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing newPassword", () => {
    const result = forgotPasswordSchema.safeParse({
      username: "alice",
      recoveryCode: "RC_4A7F8C.JQ8K-H4XT-MP2L",
    });
    expect(result.success).toBe(false);
  });

  it("rejects newPassword too short", () => {
    const result = forgotPasswordSchema.safeParse({
      username: "alice",
      recoveryCode: "RC_4A7F8C.JQ8K-H4XT-MP2L",
      newPassword: "short",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// regenerateRecoveryCodesSchema
// ---------------------------------------------------------------------------
describe("regenerateRecoveryCodesSchema", () => {
  it("accepts valid currentPassword", () => {
    const result = regenerateRecoveryCodesSchema.safeParse({
      currentPassword: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing currentPassword", () => {
    const result = regenerateRecoveryCodesSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty currentPassword", () => {
    const result = regenerateRecoveryCodesSchema.safeParse({
      currentPassword: "",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkUsernameSchema
// ---------------------------------------------------------------------------
describe("checkUsernameSchema", () => {
  it("accepts valid username", () => {
    const result = checkUsernameSchema.safeParse({ username: "alice" });
    expect(result.success).toBe(true);
  });

  it("rejects username too short", () => {
    const result = checkUsernameSchema.safeParse({ username: "ab" });
    expect(result.success).toBe(false);
  });

  it("rejects username with special characters", () => {
    const result = checkUsernameSchema.safeParse({ username: "user@name" });
    expect(result.success).toBe(false);
  });

  it("accepts username with underscores", () => {
    const result = checkUsernameSchema.safeParse({ username: "user_name" });
    expect(result.success).toBe(true);
  });

  it("accepts username with numbers", () => {
    const result = checkUsernameSchema.safeParse({ username: "user123" });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateStatusSchema
// ---------------------------------------------------------------------------
describe("updateStatusSchema", () => {
  it("accepts valid status", () => {
    const result = updateStatusSchema.safeParse({ status: "AVAILABLE" });
    expect(result.success).toBe(true);
  });

  it("accepts custom status", () => {
    const result = updateStatusSchema.safeParse({
      customStatus: "In a meeting",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all USER_STATUSES values", () => {
    for (const status of USER_STATUSES) {
      const result = updateStatusSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    const result = updateStatusSchema.safeParse({ status: "OFFLINE" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (strict)", () => {
    const result = updateStatusSchema.safeParse({
      status: "AVAILABLE",
      extraField: "bad",
    });
    expect(result.success).toBe(false);
  });

  it("accepts _csrf", () => {
    const result = updateStatusSchema.safeParse({
      status: "AVAILABLE",
      _csrf: "token",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updateStatusSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts null custom status", () => {
    const result = updateStatusSchema.safeParse({ customStatus: null });
    expect(result.success).toBe(true);
  });

  it("rejects custom status over 128 chars", () => {
    const result = updateStatusSchema.safeParse({
      customStatus: "a".repeat(129),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updatePrivacySchema
// ---------------------------------------------------------------------------
describe("updatePrivacySchema", () => {
  it("accepts valid privacy update", () => {
    const result = updatePrivacySchema.safeParse({
      showOnlineStatus: true,
      showTypingStatus: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updatePrivacySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial update", () => {
    const result = updatePrivacySchema.safeParse({ showOnlineStatus: true });
    expect(result.success).toBe(true);
  });

  it("rejects unknown fields (strict)", () => {
    const result = updatePrivacySchema.safeParse({
      showOnlineStatus: true,
      extraField: "bad",
    });
    expect(result.success).toBe(false);
  });

  it("accepts _csrf", () => {
    const result = updatePrivacySchema.safeParse({
      showOnlineStatus: true,
      _csrf: "token",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-boolean values", () => {
    const result = updatePrivacySchema.safeParse({
      showOnlineStatus: "yes",
    });
    expect(result.success).toBe(false);
  });
});
