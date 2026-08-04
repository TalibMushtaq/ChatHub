import { redis } from "../lib/redis";
import { IDEMPOTENCY_TTL_SECONDS } from "../constants/attachment";

/**
 * Idempotency helper for message creation.
 *
 * Mobile clients may retry requests. An idempotency key prevents duplicate
 * message creation when the same authenticated user retries with the same key.
 *
 * Redis key format: idempotency:{userId}:{clientKey}
 * TTL: 24 hours
 */

/**
 * Check if an idempotency key exists. If so, return the existing messageId.
 * If not, return null.
 */
export async function checkIdempotency(
  userId: string,
  idempotencyKey: string,
): Promise<string | null> {
  const key = `idempotency:${userId}:${idempotencyKey}`;
  const value = await redis.get(key);
  return value;
}

/**
 * Store an idempotency key -> messageId mapping in Redis.
 */
export async function storeIdempotency(
  userId: string,
  idempotencyKey: string,
  messageId: string,
): Promise<void> {
  const key = `idempotency:${userId}:${idempotencyKey}`;
  await redis.set(key, messageId, { EX: IDEMPOTENCY_TTL_SECONDS });
}
