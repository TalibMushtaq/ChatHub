import { describe, it, expect, vi, beforeEach } from "vitest";
import argon2 from "argon2";
import { PasswordService } from "../../../src/services/PasswordService";

describe("PasswordService", () => {
  const hashOptions = {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  };
  const dummyHash = "dummy-hash";

  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService(hashOptions, dummyHash);
    vi.clearAllMocks();
  });

  it("should hash a password with argon2", async () => {
    vi.mocked(argon2.hash).mockResolvedValue("hashed");
    const result = await service.hash("password");
    expect(argon2.hash).toHaveBeenCalledWith(
      "password",
      expect.objectContaining({ raw: false }),
    );
    expect(result).toBe("hashed");
  });

  it("should verify a password against a hash", async () => {
    vi.mocked(argon2.verify).mockResolvedValue(true);
    const result = await service.verify("hash", "password");
    expect(argon2.verify).toHaveBeenCalledWith("hash", "password");
    expect(result).toBe(true);
  });

  it("should return false for wrong password", async () => {
    vi.mocked(argon2.verify).mockResolvedValue(false);
    const result = await service.verify("hash", "wrong");
    expect(result).toBe(false);
  });

  it("should detect rehash needs", () => {
    vi.mocked(argon2.needsRehash).mockReturnValue(true);
    const result = service.needsRehash("old");
    expect(argon2.needsRehash).toHaveBeenCalledWith("old", {
      memoryCost: hashOptions.memoryCost,
      timeCost: hashOptions.timeCost,
      parallelism: hashOptions.parallelism,
    });
    expect(result).toBe(true);
  });

  it("should return the dummy hash", () => {
    expect(service.getDummyHash()).toBe(dummyHash);
  });
});
