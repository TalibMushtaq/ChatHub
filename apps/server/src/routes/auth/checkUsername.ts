import { Router } from "express";
import { prisma } from "../../../db/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { createRateLimiter, setRateLimitHeaders } from "../../lib/rateLimiter";
import { checkUsernameSchema } from "@repo/validators";
import { createLogger } from "../../lib/logger";

const router = Router();
const log = createLogger("checkUsername");

const checkUsernameLimiter = createRateLimiter({
  maxAttempts: 30,
  windowMs: 60_000,
  prefix: "check:username",
});

/**
 * GET /check-username?username=...
 *
 * Public endpoint used during onboarding to provide live username-availability
 * feedback. It is unauthenticated (the user has not signed up yet) but is
 * rate-limited per IP and validates the same format rules as signup so the
 * client cannot ask about arbitrary strings.
 */
router.get(
  "/check-username",
  asyncHandler(async (req, res) => {
    const clientIp = req.ip ?? "unknown";
    const rate = await checkUsernameLimiter(clientIp);
    setRateLimitHeaders(res, rate);
    if (!rate.allowed) {
      return res.status(429).json({ ok: false, error: "Rate limit exceeded" });
    }

    const parsed = checkUsernameSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid username",
      });
    }

    const username = parsed.data.username.trim().toLowerCase();

    // A simple existence count is enough: usernames are unique, so 0 means
    // available and anything else means taken. No user details are returned.
    const existing = await prisma.user.count({ where: { username } });
    const available = existing === 0;

    log.info("Username availability checked", { username, available });

    res.json({ ok: true, available });
  }),
);

export default router;
