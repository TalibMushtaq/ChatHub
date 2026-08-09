import { describe, it, expect, vi, beforeEach } from "vitest";
import { redis } from "../../../src/lib/redis";
import { createRateLimiter } from "../../../src/lib/rateLimiter";

describe("rateLimiter - retryAfter fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fall back to the window length when Redis reports no TTL", async () => {
    vi.mocked(redis.eval).mockResolvedValue([6, -1]);

    const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 90_000 });
    const result = await limiter("key1");

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(90);
  });
});
