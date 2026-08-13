/**
 * One-time recovery-code display via a short-lived Redis-backed token.
 *
 * signup / forgot-password / regenerate issue codes through issueRecoveryToken,
 * which returns a random token and stores the plaintext codes in Redis under a
 * 10-minute TTL. The codes never ride in an HTTP response body where a proxy or
 * access-log could capture them; the client exchanges the token exactly once
 * (GETDEL is atomic) through POST /auth/recovery-codes/show.
 */

import { randomBytes } from "node:crypto";
import { redis } from "../lib/redis";
import { createLogger } from "../lib/logger";
import type { GeneratedCode } from "../lib/recoveryCode";

const log = createLogger("recoveryShow");

/** How long a one-time recovery-code token remains valid. */
export const RECOVERY_TOKEN_TTL_SECONDS = 10 * 60;

/** Tokens are 32 random bytes as hex; anything else is rejected before use. */
const TOKEN_RE = /^[a-f0-9]{64}$/;

/**
 * Store plaintext codes under a fresh random token and return the token.
 * Codes are retrievable exactly once and expire after 10 minutes.
 */
export async function issueRecoveryToken(
  codes: GeneratedCode[],
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await redis.set(
    `recovery-codes:${token}`,
    JSON.stringify(codes.map((c) => c.fullCode)),
    { EX: RECOVERY_TOKEN_TTL_SECONDS },
  );
  return token;
}

/**
 * Atomically fetch-and-delete the codes for a token.
 *
 * Returns null on an unknown, malformed, expired, or already-consumed token.
 */
export async function consumeRecoveryToken(
  token: string,
): Promise<string[] | null> {
  if (!TOKEN_RE.test(token)) return null;

  const raw = await redis.getDel(`recovery-codes:${token}`);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((c) => typeof c === "string")
    ) {
      return parsed;
    }
  } catch {
    // Malformed payload falls through to the warning below.
  }

  log.warn("Recovery token payload was malformed", {
    token: token.slice(0, 8),
  });
  return null;
}
