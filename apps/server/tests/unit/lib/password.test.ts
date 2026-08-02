import { describe, it, expect, vi, beforeEach } from "vitest";
import argon2 from "argon2";
import {
  hashPassword,
  verifyPassword,
  passwordNeedsRehash,
  PASSWORD_HASH_OPTIONS,
} from "../../../src/lib/password";

describe("password utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should hash a password using argon2", async () => {
    vi.mocked(argon2.hash).mockResolvedValue("hashed-password");
    const result = await hashPassword("plain");
    expect(argon2.hash).toHaveBeenCalledWith("plain", PASSWORD_HASH_OPTIONS);
    expect(result).toBe("hashed-password");
  });

  it("should verify a password against a hash", async () => {
    vi.mocked(argon2.verify).mockResolvedValue(true);
    const result = await verifyPassword("hash", "plain");
    expect(argon2.verify).toHaveBeenCalledWith("hash", "plain");
    expect(result).toBe(true);
  });

  it("should return false for invalid password", async () => {
    vi.mocked(argon2.verify).mockResolvedValue(false);
    const result = await verifyPassword("hash", "wrong");
    expect(result).toBe(false);
  });

  it("should detect when a hash needs rehashing", async () => {
    vi.mocked(argon2.needsRehash).mockReturnValue(true);
    const result = await passwordNeedsRehash("old-hash");
    expect(argon2.needsRehash).toHaveBeenCalledWith("old-hash", {
      memoryCost: PASSWORD_HASH_OPTIONS.memoryCost,
      timeCost: PASSWORD_HASH_OPTIONS.timeCost,
      parallelism: PASSWORD_HASH_OPTIONS.parallelism,
    });
    expect(result).toBe(true);
  });

  it("should return false when hash does not need rehashing", async () => {
    vi.mocked(argon2.needsRehash).mockReturnValue(false);
    const result = await passwordNeedsRehash("current-hash");
    expect(result).toBe(false);
  });
});
