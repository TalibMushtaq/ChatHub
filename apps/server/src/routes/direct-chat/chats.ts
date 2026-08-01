import { Router } from "express";
import requireAuth from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/async-handler";
import { startDirectChat } from "../../services/direct-chat/startDirectChat";
import { getInbox } from "../../services/direct-chat/getInbox";
import {
  createRateLimiter,
  setRateLimitHeaders,
} from "../../lib/rateLimiter";
import { startDmSchema } from "@repo/validators";

const startDmLimiter = createRateLimiter({
  maxAttempts: 30,
  windowMs: 60_000,
  prefix: "dm:start",
});

const router = Router();

// POST /start-dm/:userId
router.post(
  "/start-dm/:userId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const myId = req.user.id;
    const otherId = req.params.userId;

    if (!otherId) {
      res.status(400).json({ ok: false, error: "target userId not provided" });
      return;
    }

    // Rate-limit before Zod validation: parsing is more expensive than
    // a Redis INCR, and we don't want to waste CPU on abusive requests.
    const rate = await startDmLimiter(`start-dm:${myId}`);
    setRateLimitHeaders(res, rate);
    if (!rate.allowed) {
      res.status(429).json({ ok: false, error: "Rate limit exceeded" });
      return;
    }

    const parsed = startDmSchema.safeParse({ userId: otherId });
    if (!parsed.success) {
      res
        .status(400)
        .json({
          ok: false,
          error: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      return;
    }

    const { chat, created } = await startDirectChat(myId, parsed.data.userId);
    res.status(200).json({ ok: true, chat, created });
  }),
);

// GET /inbox
router.get(
  "/inbox",
  requireAuth,
  asyncHandler(async (req, res) => {
    const inbox = await getInbox(req.user.id);
    res.json({ ok: true, inbox });
  }),
);

export default router;
