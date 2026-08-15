import { Router } from "express";
import requireAuth from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/async-handler";
import { createRateLimiter, enforceRateLimit } from "../lib/rateLimiter";
import { unwrapParsed } from "../lib/validate";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@repo/validators";
import {
  upsertPushSubscription,
  deletePushSubscription,
} from "../services/push/push";

const router = Router();

// Subscribing re-registers on every login/tab; unsubscribing is rare. Both
// are cheap DB writes so the limiter only guards against abuse.
const subscribeLimiter = createRateLimiter({
  maxAttempts: 20,
  windowMs: 60_000,
  prefix: "push:sub",
});
const unsubscribeLimiter = createRateLimiter({
  maxAttempts: 60,
  windowMs: 60_000,
  prefix: "push:unsub",
});

// POST /api/push/subscribe — register a browser push subscription.
router.post(
  "/subscribe",
  requireAuth,
  asyncHandler(async (req, res) => {
    await enforceRateLimit(res, subscribeLimiter, `sub:${req.user.id}`);

    const body = unwrapParsed(pushSubscribeSchema.safeParse(req.body));

    await upsertPushSubscription(req.user.id, body.endpoint, body.keys);
    res.status(201).json({ ok: true });
  }),
);

// DELETE /api/push/subscribe — remove a browser push subscription.
router.delete(
  "/subscribe",
  requireAuth,
  asyncHandler(async (req, res) => {
    await enforceRateLimit(res, unsubscribeLimiter, `unsub:${req.user.id}`);

    const body = unwrapParsed(pushUnsubscribeSchema.safeParse(req.body));

    await deletePushSubscription(req.user.id, body.endpoint);
    res.json({ ok: true });
  }),
);

export default router;
