/**
 * POST /auth/recovery-codes/show
 *
 * Exchanges a one-time recovery-code token for the plaintext codes.
 *
 * Security properties:
 * - The token was issued by issueRecoveryToken (signup / forgot-password /
 *   regenerate) and is consumed atomically via GETDEL, so codes are shown
 *   exactly once.
 * - Tokens are 256-bit random values with a 10-minute expiry, so guessing or
 *   replaying is not practical.
 * - The response is marked no-store so intermediaries never cache the codes.
 */

import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler";
import { createRateLimiter, setRateLimitHeaders } from "../../lib/rateLimiter";
import { z } from "zod";
import { consumeRecoveryToken } from "../../services/recoveryShow";

const router = Router();

const showLimiter = createRateLimiter({
  maxAttempts: 30,
  windowMs: 60_000,
  prefix: "recovery:show",
});

const showSchema = z.object({ token: z.string().min(1) });

router.post(
  "/recovery-codes/show",
  asyncHandler(async (req, res) => {
    const clientIp = req.ip ?? "unknown";
    const rate = await showLimiter(clientIp);
    setRateLimitHeaders(res, rate);
    if (!rate.allowed) {
      res.status(429).json({ ok: false, error: "Too many attempts" });
      return;
    }

    const parsed = showSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid token" });
      return;
    }

    const codes = await consumeRecoveryToken(parsed.data.token);
    if (!codes) {
      res.status(400).json({ ok: false, error: "Invalid or expired token" });
      return;
    }

    // Codes are high-value single-use secrets; never cache them anywhere
    // between the client and the server.
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, recoveryCodes: codes });
  }),
);

export default router;
