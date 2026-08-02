import { describe, it, expect, vi, beforeEach } from "vitest";
import { redis } from "../../../src/lib/redis";
import { createRateLimiter, setRateLimitHeaders } from "../../../src/lib/rateLimiter";

describe("rateLimiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow requests under the limit", async () => {
    vi.mocked(redis.eval).mockResolvedValue([1, 60]);

    const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 60_000 });
    const result = await limiter("key1");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.retryAfter).toBe(0);
    expect(result.limit).toBe(5);
  });

  it("should block requests over the limit", async () => {
    vi.mocked(redis.eval).mockResolvedValue([6, 30]);

    const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 60_000 });
    const result = await limiter("key1");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBe(30);
  });

  it("should use default prefix 'rl' when not provided", async () => {
    vi.mocked(redis.eval).mockResolvedValue([1, 60]);

    const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 60_000 });
    await limiter("key1");

    expect(redis.eval).toHaveBeenCalledOnce();
    const args = vi.mocked(redis.eval).mock.calls[0]!;
    expect(args[1]?.keys?.[0]).toBe("rl:key1");
  });

  it("should use custom prefix when provided", async () => {
    vi.mocked(redis.eval).mockResolvedValue([1, 60]);

    const limiter = createRateLimiter({
      maxAttempts: 5,
      windowMs: 60_000,
      prefix: "custom",
    });
    await limiter("key1");

    const args = vi.mocked(redis.eval).mock.calls[0]!;
    expect(args[1]?.keys?.[0]).toBe("custom:key1");
  });

  it("should convert windowMs to seconds (rounded up)", async () => {
    vi.mocked(redis.eval).mockResolvedValue([1, 60]);

    const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 15_000 });
    await limiter("key1");

    const args = vi.mocked(redis.eval).mock.calls[0]!;
    expect(args[1]?.arguments?.[0]).toBe("15");
  });

  it("should fail open when Redis throws", async () => {
    vi.mocked(redis.eval).mockRejectedValue(new Error("Redis down"));

    const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 60_000 });
    const result = await limiter("key1");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
    expect(result.retryAfter).toBe(0);
  });

  it("should set standard rate-limit headers on response", () => {
    const res = { setHeader: vi.fn() };

    setRateLimitHeaders(res, {
      allowed: true,
      remaining: 3,
      retryAfter: 0,
      limit: 5,
    });

    expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Limit", 5);
    expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Remaining", 3);
    expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Reset", 5);
    expect(res.setHeader).not.toHaveBeenCalledWith("Retry-After", expect.anything);
  });

  it("should set Retry-After header when blocked", () => {
    const res = { setHeader: vi.fn() };

    setRateLimitHeaders(res, {
      allowed: false,
      remaining: 0,
      retryAfter: 42,
      limit: 5,
    });

    expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Limit", 5);
    expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Remaining", 0);
    expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Reset", 42);
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", 42);
  });
});
