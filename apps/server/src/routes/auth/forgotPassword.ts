/**
 * POST /auth/forgot-password
 *
 * Password recovery via recovery code.
 *
 * Security properties:
 * - Timing-safe username lookup: performs a dummy Argon2 verify when the user
 *   does not exist so response time is statistically identical to a valid attempt.
 * - Enumeration resistance: all failure paths return the same 400 response.
 * - Rate limiting: per-IP and per-username limits with exponential backoff.
 * - Atomic redemption: Prisma transaction guarantees no partial updates.
 * - Race-condition prevention: conditional updateMany ensures only one concurrent
 *   request can redeem a given code.
 * - Replay protection: used codes are immediately invalidated; remaining codes
 *   are deleted and replaced with a fresh batch.
 */

import { Router } from "express";
import { prisma } from "../../../db/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import {
  createRateLimiter,
  setRateLimitHeaders,
} from "../../lib/rateLimiter";
import { createLogger } from "../../lib/logger";
import { forgotPasswordSchema } from "@repo/validators";
import { parseRecoveryCode } from "../../lib/recoveryCode";
import { RecoveryCodeService } from "../../services/RecoveryCodeService";
import { PasswordService } from "../../services/PasswordService";
import { PASSWORD_HASH_OPTIONS } from "../../lib/password";
import { ApiError } from "../../lib/ApiError";

const log = createLogger("forgotPassword");
const router = Router();

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------

const ipLimiter = createRateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60_000,
  prefix: "forgotpw:ip",
});

const userLimiter = createRateLimiter({
  maxAttempts: 3,
  windowMs: 15 * 60_000,
  prefix: "forgotpw:user",
});

// ---------------------------------------------------------------------------
// Dummy hash for constant-time username-lookup failures
// ---------------------------------------------------------------------------

const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const passwordService = new PasswordService(PASSWORD_HASH_OPTIONS, DUMMY_HASH);
const recoveryService = new RecoveryCodeService(prisma, passwordService);

/**
 * Unified failure response.
 *
 * Every validation, enumeration, or redemption failure returns exactly this
 * — no information leakage about whether the username exists, the code
 * is malformed, or the code was already used.
 */
const FAILURE_RESPONSE = { ok: false, error: "Invalid request" } as const;

router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const clientIp = req.ip ?? "unknown";

    // --- Rate limit by IP ---
    const ipRate = await ipLimiter(clientIp);
    setRateLimitHeaders(res, ipRate);
    if (!ipRate.allowed) {
      return res.status(429).json({ ok: false, error: "Too many attempts" });
    }

    // --- Validate body ---
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(FAILURE_RESPONSE);
    }

    const { username, recoveryCode: rawCode, newPassword } = parsed.data;
    const normalizedUsername = username.toLowerCase();

    // --- Rate limit by username ---
    const userRate = await userLimiter(normalizedUsername);
    setRateLimitHeaders(res, userRate);
    if (!userRate.allowed) {
      return res.status(429).json({ ok: false, error: "Too many attempts" });
    }

    // --- Lookup user ---
    const user = await prisma.user.findUnique({
      where: { username: normalizedUsername },
      select: { id: true, username: true },
    });

    // --- Timing-safe dummy verification ---
    // If the user does not exist, we still perform an Argon2 verify against
    // a dummy hash so that the response time is statistically identical to a
    // valid attempt. This prevents timing-based account enumeration.
    const parsedCode = parseRecoveryCode(rawCode);
    if (!parsedCode) {
      // Even for malformed codes, burn CPU time to keep timing consistent.
      await passwordService.verify(DUMMY_HASH, "dummy-secret");
      return res.status(400).json(FAILURE_RESPONSE);
    }

    if (!user) {
      await passwordService.verify(DUMMY_HASH, parsedCode.secret);
      return res.status(400).json(FAILURE_RESPONSE);
    }

    // --- Redeem recovery code ---
    try {
      const newCodes = await recoveryService.redeem(
        user.id,
        parsedCode.codeId,
        parsedCode.secret,
        newPassword,
      );

      log.info("Password reset via recovery code", { userId: user.id });

      return res.status(200).json({
        ok: true,
        recoveryCodes: newCodes.map((c) => c.fullCode),
      });
    } catch (err) {
      // Any failure from redeem() (invalid code, already used, race condition)
      // maps to the same generic error to prevent information leakage.
      log.warn("Recovery code redemption failed", {
        userId: user.id,
        codeId: parsedCode.codeId,
        reason: err instanceof Error ? err.message : String(err),
      });
      return res.status(400).json(FAILURE_RESPONSE);
    }
  }),
);

export default router;
