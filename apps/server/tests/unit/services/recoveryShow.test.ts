import { describe, it, expect, vi } from "vitest";
import {
  issueRecoveryToken,
  consumeRecoveryToken,
} from "../../../src/services/recoveryShow";
import { redis } from "../../../src/lib/redis";

import type { GeneratedCode } from "../../../src/lib/recoveryCode";

describe("recoveryShow", () => {
  const codes: GeneratedCode[] = [
    { fullCode: "RC_ABCD.1234-5678-90EF", codeId: "id-1", secret: "secret-1" },
  ];
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("issueRecoveryToken", () => {
    it("stores the codes under a random 64-char token with a 10-minute TTL", async () => {
      vi.mocked(redis.set).mockResolvedValue("OK");

      const token = await issueRecoveryToken(codes);

      expect(token).toMatch(/^[a-f0-9]{64}$/);
      expect(redis.set).toHaveBeenCalledOnce();
      const [key, value, opts] = vi.mocked(redis.set).mock.calls[0];
      expect(key).toMatch(/^recovery-codes:[a-f0-9]{64}$/);
      expect(value).toBe(JSON.stringify(["RC_ABCD.1234-5678-90EF"]));
      expect(opts).toEqual({ EX: 600 });
    });
  });

  describe("consumeRecoveryToken", () => {
    it("returns the codes for a valid token", async () => {
      vi.mocked(redis.getDel).mockResolvedValue(
        JSON.stringify(["RC_ABCD.1234-5678-90EF"]),
      );

      const codes = await consumeRecoveryToken("a".repeat(64));

      expect(codes).toEqual(["RC_ABCD.1234-5678-90EF"]);
      expect(redis.getDel).toHaveBeenCalledOnce();
    });

    it("returns null for a malformed token without touching Redis", async () => {
      const codes = await consumeRecoveryToken("not-hex");
      expect(codes).toBeNull();
      expect(redis.getDel).not.toHaveBeenCalled();
    });

    it("returns null for an expired or unknown token", async () => {
      vi.mocked(redis.getDel).mockResolvedValue(null);
      const codes = await consumeRecoveryToken("a".repeat(64));
      expect(codes).toBeNull();
    });

    it("returns null for a malformed stored payload", async () => {
      vi.mocked(redis.getDel).mockResolvedValue("not-json");
      const codes = await consumeRecoveryToken("a".repeat(64));
      expect(codes).toBeNull();
    });

    it("returns null when the stored payload is not an array of strings", async () => {
      vi.mocked(redis.getDel).mockResolvedValue(JSON.stringify({ foo: "bar" }));
      const codes = await consumeRecoveryToken("a".repeat(64));
      expect(codes).toBeNull();
    });
  });
});
