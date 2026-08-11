import { Router } from "express";
import requireAuth from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/async-handler";
import { startDirectChat } from "../../services/direct-chat/startDirectChat";
import { getInbox } from "../../services/direct-chat/getInbox";
import { markDirectChatRead } from "../../services/direct-chat/markRead";
import { assertDirectChatAccess } from "../../middleware/socketAccess";
import { createRateLimiter, enforceRateLimit } from "../../lib/rateLimiter";
import { unwrapParsed } from "../../lib/validate";
import {
  startDmSchema,
  directChatIdParamSchema,
  markReadSchema,
  getInboxQuerySchema,
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
    await enforceRateLimit(res, startDmLimiter, `start-dm:${myId}`);

    const parsed = unwrapParsed(startDmSchema.safeParse({ userId: otherId }));

    const { chat, created } = await startDirectChat(myId, parsed.userId);
    res.status(200).json({ ok: true, chat, created });
  }),
);

// GET /inbox
router.get(
  "/inbox",
  requireAuth,
  asyncHandler(async (req, res) => {
    // Parse optional cursor/limit query params; invalid values fall back to defaults.
    const query = getInboxQuerySchema.safeParse(req.query);
    const { cursor, limit } = query.success ? query.data : {};

    const { inbox, nextCursor } = await getInbox(req.user.id, {
      cursor,
      limit,
    });
    res.json({ ok: true, inbox, nextCursor });
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

    const { directChatId } = unwrapParsed(
      directChatIdParamSchema.safeParse(req.params),
      { message: "directChatId missing" },
    );

    await enforceRateLimit(res, markReadLimiter, `markread:${userId}`);

    const body = unwrapParsed(markReadSchema.safeParse(req.body));

    await assertDirectChatAccess(userId, directChatId);

    const result = await markDirectChatRead(
      userId,
      directChatId,
      body.lastReadMessageId,
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
