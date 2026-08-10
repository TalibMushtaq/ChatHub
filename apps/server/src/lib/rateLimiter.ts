import { redis } from "./redis";
import { createLogger } from "./logger";
import { ApiError } from "./ApiError";

const log = createLogger("rateLimiter");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimiterOptions {
  maxAttempts: number;
  windowMs: number;
  /** Optional prefix for Redis keys. Defaults to "rl". */
  prefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Lua script — atomic INCR + EXPIRE
// ---------------------------------------------------------------------------
//
// Why a Lua script?
// - INCR alone doesn't set expiry on first increment.
// - A MULTI/EXEC pipeline has a small race between INCR and EXPIRE.
// - Lua scripts execute atomically on the Redis server (EVALSHA), so the
//   INCR + conditional EXPIRE is guaranteed to be atomic.
//
// KEYS[1] = the rate-limit key
// ARGV[1] = window in seconds
// ARGV[2] = max attempts
//
// Returns: [currentCount, ttl]
//   currentCount — the count AFTER incrementing
//   ttl          — remaining TTL in seconds (-1 if no expiry set)

const INCR_WITH_EXPIRE_SCRIPT = `
local key = KEYS[1]
local windowSec = tonumber(ARGV[1])
local maxAttempts = tonumber(ARGV[2])

local count = redis.call("INCR", key)

if count == 1 then
  redis.call("EXPIRE", key, windowSec)
end

local ttl = redis.call("TTL", key)

return { count, ttl }
`;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Creates a Redis-backed, distributed rate limiter.
 *
 * Key format: `{prefix}:{key}`
 * Example:    `rl:login:192.168.1.1:user@example.com`
 *
 * Strategy:
 * - On each request, atomically INCR the counter and set EXPIRE on first hit.
 * - If the counter exceeds maxAttempts, the request is rejected.
 * - Redis TTL automatically cleans up expired keys — no background jobs.
 *
 * Time complexity: O(1) per check (INCR + EXPIRE + TTL are all O(1)).
 *
 * Concurrency: The Lua script executes atomically on the Redis server,
 * so concurrent requests from multiple processes/containers are safe.
 *
 * Failure mode: If Redis is unreachable, the limiter **fails open**
 * (allows the request) and logs the error. This is a deliberate choice:
 * a down Redis should not cause a full outage of auth endpoints.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const { maxAttempts, windowMs, prefix = "rl" } = options;
  const windowSec = Math.ceil(windowMs / 1000);

  return async function check(key: string): Promise<RateLimitResult> {
    const redisKey = `${prefix}:${key}`;

    try {
      const result = (await redis.eval(INCR_WITH_EXPIRE_SCRIPT, {
        keys: [redisKey],
        arguments: [String(windowSec), String(maxAttempts)],
      })) as [number, number];

      const [count, ttl] = result;

      const allowed = count <= maxAttempts;
      const remaining = Math.max(0, maxAttempts - count);
      const retryAfter = allowed ? 0 : ttl > 0 ? ttl : windowSec;

      return { allowed, remaining, retryAfter, limit: maxAttempts };
    } catch (err) {
      // Fail open: if Redis is down, allow the request rather than
      // blocking all users. Log the error for ops visibility.
      log.error("Redis rate limiter error — failing open", err);
      return {
        allowed: true,
        remaining: maxAttempts,
        retryAfter: 0,
        limit: maxAttempts,
      };
    }
  };
}

// ---------------------------------------------------------------------------
// Helpers for Express routes
// ---------------------------------------------------------------------------

/**
 * Sets standard rate-limit headers on an Express response.
 *
 * Headers:
 * - RateLimit-Limit:     maximum requests per window
 * - RateLimit-Remaining: attempts left in current window
 * - RateLimit-Reset:     seconds until the window resets
 * - Retry-After:         seconds until the client may retry (only when blocked)
 */
export function setRateLimitHeaders(
  res: { setHeader(name: string, value: string | number): void },
  result: RateLimitResult,
): void {
  res.setHeader("RateLimit-Limit", result.limit);
  res.setHeader("RateLimit-Remaining", result.remaining);
  res.setHeader("RateLimit-Reset", result.retryAfter || result.limit);
  if (!result.allowed) {
    res.setHeader("Retry-After", result.retryAfter);
  }
}

/**
 * Checks a limiter, writes the rate-limit headers, and throws a 429 ApiError
 * when the caller is over budget.
 *
 * Collapses the check/headers/reject sequence every rate-limited route repeats.
 */
export async function enforceRateLimit(
  res: { setHeader(name: string, value: string | number): void },
  limiter: (key: string) => Promise<RateLimitResult>,
  key: string,
): Promise<void> {
  const result = await limiter(key);
  setRateLimitHeaders(res, result);
  if (!result.allowed) {
    throw new ApiError("Rate limit exceeded", 429);
  }
}
