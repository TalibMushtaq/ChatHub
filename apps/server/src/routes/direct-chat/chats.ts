import { Router } from "express";
import requireAuth from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/async-handler";
import { startDirectChat } from "../../services/direct-chat/startDirectChat";
import { getInbox } from "../../services/direct-chat/getInbox";
import { markDirectChatRead } from "../../services/direct-chat/markRead";
import { assertDirectChatAccess } from "../../middleware/socketAccess";
import { createRateLimiter, setRateLimitHeaders } from "../../lib/rateLimiter";
import {
  startDmSchema,
  directChatIdParamSchema,
  markReadSchema,
} from "@repo/validators";

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
      res.status(400).json({
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

// POST /:directChatId/mark-read
const markReadLimiter = createRateLimiter({
  maxAttempts: 120,
  windowMs: 60_000,
  prefix: "dm:markread",
});

router.post(
  "/:directChatId/mark-read",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const params = directChatIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ ok: false, error: "directChatId missing" });
      return;
    }
    const directChatId = params.data.directChatId;

    const rate = await markReadLimiter(`markread:${userId}`);
    setRateLimitHeaders(res, rate);
    if (!rate.allowed) {
      res.status(429).json({ ok: false, error: "Rate limit exceeded" });
      return;
    }

    const body = markReadSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        ok: false,
        error: body.error.issues[0]?.message ?? "Invalid input",
      });
      return;
    }

    await assertDirectChatAccess(userId, directChatId);

    const result = await markDirectChatRead(
      userId,
      directChatId,
      body.data.lastReadMessageId,
    );

    // Emit to all of the user's sessions so tabs/devices stay in sync.
    req.io.to(`user:${userId}`).emit("directChat:read", {
      directChatId,
      unreadCount: result.unreadCount,
    });

    res.json({ ok: true, ...result });
  }),
);

export default router;
