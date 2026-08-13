import { describe, it, expect } from "vitest";
import {
  userZod,
  checkUsernameSchema,
  searchUsersQuerySchema,
  userIdParamSchema,
  forgotPasswordSchema,
  regenerateRecoveryCodesSchema,
} from "@repo/validators";

describe("user validators", () => {
  describe("userZod.signup", () => {
    it("should accept a valid signup payload", () => {
      const result = userZod.signup.safeParse({
        email: "alice@example.com",
        username: "alice_123",
        displayName: "Alice",
        password: "password123",
      });
      expect(result.success).toBe(true);
    });

    it("should accept signup without an optional displayName", () => {
      const result = userZod.signup.safeParse({
        email: "alice@example.com",
        username: "alice_123",
        password: "password123",
      });
      expect(result.success).toBe(true);
    });

    it("should reject an invalid email", () => {
      const result = userZod.signup.safeParse({
        email: "not-an-email",
        username: "alice",
        displayName: "Alice",
        password: "password123",
      });
      expect(result.success).toBe(false);
    });

    it("should reject a short username", () => {
      const result = userZod.signup.safeParse({
        email: "alice@example.com",
        username: "al",
        displayName: "Alice",
        password: "password123",
      });
      expect(result.success).toBe(false);
    });

    it("should reject a long username", () => {
      const result = userZod.signup.safeParse({
        email: "alice@example.com",
        username: "a".repeat(21),
        displayName: "Alice",
        password: "password123",
      });
      expect(result.success).toBe(false);
    });

    it("should reject username with invalid characters", () => {
      const result = userZod.signup.safeParse({
        email: "alice@example.com",
        username: "alice-123",
        displayName: "Alice",
        password: "password123",
      });
      expect(result.success).toBe(false);
    });

    it("should reject a short password", () => {
      const result = userZod.signup.safeParse({
        email: "alice@example.com",
        username: "alice",
        displayName: "Alice",
        password: "short",
      });
      expect(result.success).toBe(false);
    });

    it("should reject a long password", () => {
      const result = userZod.signup.safeParse({
        email: "alice@example.com",
        username: "alice",
        displayName: "Alice",
        password: "p".repeat(73),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("userZod.login", () => {
    it("should accept login with email", () => {
      const result = userZod.login.safeParse({
        email: "alice@example.com",
        password: "password123",
      });
      expect(result.success).toBe(true);
    });

    it("should accept login with username", () => {
      const result = userZod.login.safeParse({
        username: "alice",
        password: "password123",
      });
      expect(result.success).toBe(true);
    });

    it("should reject login with both email and username missing", () => {
      const result = userZod.login.safeParse({
        password: "password123",
      });
      expect(result.success).toBe(false);
    });

    it("should reject login with empty password", () => {
      const result = userZod.login.safeParse({
        email: "alice@example.com",
        password: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("userZod.updateMe", () => {
    it("should accept a partial update", () => {
      const result = userZod.updateMe.safeParse({
        displayName: "New Name",
      });
      expect(result.success).toBe(true);
    });

    it("should accept all new profile fields", () => {
      const result = userZod.updateMe.safeParse({
        displayName: "Alice",
        bio: "Hello world",
        gender: "FEMALE",
        dateOfBirth: "1990-05-21",
      });
      expect(result.success).toBe(true);
    });

    it("should accept _csrf injected by the shared API client", () => {
      const result = userZod.updateMe.safeParse({
        bio: "Hello",
        _csrf: "some-token",
      });
      expect(result.success).toBe(true);
    });

    it("should reject a bio over 160 characters", () => {
      const result = userZod.updateMe.safeParse({
        bio: "a".repeat(161),
      });
      expect(result.success).toBe(false);
    });

    it("should reject an invalid gender value", () => {
      const result = userZod.updateMe.safeParse({
        gender: "UNKNOWN",
      });
      expect(result.success).toBe(false);
    });

    it("should reject a future date of birth", () => {
      const result = userZod.updateMe.safeParse({
        dateOfBirth: new Date(Date.now() + 86400000).toISOString(),
      });
      expect(result.success).toBe(false);
    });

    it("should reject username even though the schema no longer lists it", () => {
      const result = userZod.updateMe.safeParse({
        username: "newname",
      });
      expect(result.success).toBe(false);
    });

    it("should accept password change with both fields", () => {
      const result = userZod.updateMe.safeParse({
        currentPassword: "old",
        newPassword: "newpassword123",
      });
      expect(result.success).toBe(true);
    });

    it("should reject password change with only currentPassword", () => {
      const result = userZod.updateMe.safeParse({
        currentPassword: "old",
      });
      expect(result.success).toBe(false);
    });

    it("should reject password change with only newPassword", () => {
      const result = userZod.updateMe.safeParse({
        newPassword: "newpassword123",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("searchUsersQuerySchema", () => {
    it("should accept a valid query", () => {
      const result = searchUsersQuerySchema.safeParse({
        query: "alice",
        limit: "10",
      });
      expect(result.success).toBe(true);
    });

    it("should reject a short query", () => {
      const result = searchUsersQuerySchema.safeParse({ query: "a" });
      expect(result.success).toBe(false);
    });

    it("should reject limit above 50", () => {
      const result = searchUsersQuerySchema.safeParse({
        query: "alice",
        limit: "60",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("userIdParamSchema", () => {
    it("should accept a valid UUID", () => {
      const result = userIdParamSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });

    it("should reject an invalid UUID", () => {
      const result = userIdParamSchema.safeParse({ id: "not-a-uuid" });
      expect(result.success).toBe(false);
    });
  });

  describe("forgotPasswordSchema", () => {
    it("should accept a valid recovery code", () => {
      const result = forgotPasswordSchema.safeParse({
        username: "alice",
        recoveryCode: "RC_AAAA22.AAAA-AAAA-AAAA",
        newPassword: "newpassword123",
      });
      expect(result.success).toBe(true);
    });

    it("should reject an invalid recovery code format", () => {
      const result = forgotPasswordSchema.safeParse({
        username: "alice",
        recoveryCode: "INVALID",
        newPassword: "newpassword123",
      });
      expect(result.success).toBe(false);
    });

    it("should reject a short newPassword", () => {
      const result = forgotPasswordSchema.safeParse({
        username: "alice",
        recoveryCode: "RC_AAAA22.AAAA-AAAA-AAAA",
        newPassword: "short",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("regenerateRecoveryCodesSchema", () => {
    it("should accept a non-empty currentPassword", () => {
      const result = regenerateRecoveryCodesSchema.safeParse({
        currentPassword: "secret",
      });
      expect(result.success).toBe(true);
    });

    it("should reject an empty currentPassword", () => {
      const result = regenerateRecoveryCodesSchema.safeParse({
        currentPassword: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("checkUsernameSchema", () => {
    it("should accept a valid username", () => {
      const result = checkUsernameSchema.safeParse({ username: "alice_123" });
      expect(result.success).toBe(true);
    });

    it("should reject a username with invalid characters", () => {
      const result = checkUsernameSchema.safeParse({ username: "alice-123" });
      expect(result.success).toBe(false);
    });

    it("should reject a short username", () => {
      const result = checkUsernameSchema.safeParse({ username: "al" });
      expect(result.success).toBe(false);
    });
  });
});
