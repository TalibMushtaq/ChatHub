import { Router } from "express";
import requireAuth from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/async-handler";
import { createRateLimiter, enforceRateLimit } from "../lib/rateLimiter";
import { unwrapParsed } from "../lib/validate";
import {
  sendFriendRequestSchema,
  friendRequestIdParamSchema,
  getFriendRequestsQuerySchema,
} from "@repo/validators";
import { sendFriendRequest } from "../services/friends/sendFriendRequest";
import { acceptFriendRequest } from "../services/friends/acceptFriendRequest";
import { declineFriendRequest } from "../services/friends/declineFriendRequest";
import { getPendingRequests } from "../services/friends/getPendingRequests";
import { pushFriendRequestEvent } from "../services/push/push";
import {
  emitFriendRequestCreated,
  emitFriendRequestAccepted,
  emitFriendRequestDeclined,
} from "../sockets/friends";

const router = Router();

// Sending is the only abuse-prone path (spam), so it gets a tight per-user
// limiter; accept/decline are one-time actions with no rate limit.
const sendRequestLimiter = createRateLimiter({
  maxAttempts: 20,
  windowMs: 60_000,
  prefix: "friends:send",
});

// POST /api/friends/requests — send a friend request. The sender is the
// authenticated session user, never a body field.
router.post(
  "/requests",
  requireAuth,
  asyncHandler(async (req, res) => {
    const myId = req.user.id;

    await enforceRateLimit(res, sendRequestLimiter, `send:${myId}`);

    const body = unwrapParsed(sendFriendRequestSchema.safeParse(req.body));

    const request = await sendFriendRequest(myId, body.userId);

    // Real-time delivery to the recipient's socket room(s), then a push so the
    // recipient still sees the request with the app closed.
    const senderName = request.sender.displayName ?? request.sender.username;
    emitFriendRequestCreated(req.io, request.recipientId, request);
    await pushFriendRequestEvent({
      event: "new",
      requestId: request.id,
      fromId: request.senderId,
      fromName: senderName,
      toUserId: request.recipientId,
    });

    res.status(201).json({ ok: true, request });
  }),
);

// GET /api/friends/requests — incoming PENDING requests for the inbox cards.
router.get(
  "/requests",
  requireAuth,
  asyncHandler(async (req, res) => {
    const query = getFriendRequestsQuerySchema.safeParse(req.query);
    const { cursor, limit } = query.success ? query.data : {};

    const { requests, nextCursor } = await getPendingRequests(req.user.id, {
      cursor,
      limit,
    });
    res.json({ ok: true, requests, nextCursor });
  }),
);

// POST /api/friends/requests/:requestId/accept
router.post(
  "/requests/:requestId/accept",
  requireAuth,
  asyncHandler(async (req, res) => {
    const myId = req.user.id;

    const { requestId } = unwrapParsed(
      friendRequestIdParamSchema.safeParse(req.params),
      { message: "requestId missing" },
    );

    const request = await acceptFriendRequest(myId, requestId);

    // Tell the original sender their request was accepted so they can flip
    // their "request sent" chip to "friends" and clear any cached card.
    const recipientName =
      request.recipient.displayName ?? request.recipient.username;
    emitFriendRequestAccepted(req.io, request.senderId, {
      requestId: request.id,
      friend: request.recipient,
    });
    await pushFriendRequestEvent({
      event: "accepted",
      requestId: request.id,
      fromId: request.recipientId,
      fromName: recipientName,
      toUserId: request.senderId,
    });

    res.json({ ok: true, request });
  }),
);

// POST /api/friends/requests/:requestId/decline
router.post(
  "/requests/:requestId/decline",
  requireAuth,
  asyncHandler(async (req, res) => {
    const myId = req.user.id;

    const { requestId } = unwrapParsed(
      friendRequestIdParamSchema.safeParse(req.params),
      { message: "requestId missing" },
    );

    const result = await declineFriendRequest(myId, requestId);

    emitFriendRequestDeclined(req.io, result.senderId, {
      requestId: result.requestId,
      userId: myId,
    });

    res.json({ ok: true, requestId: result.requestId });
  }),
);

export default router;
