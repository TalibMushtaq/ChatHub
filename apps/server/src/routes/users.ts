import { Router } from "express";
import requireAuth from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/async-handler";
import { unwrapParsed } from "../lib/validate";
import {
  blockUserIdParamSchema,
  getBlockedUsersQuerySchema,
} from "@repo/validators";
import { blockUser } from "../services/friends/blockUser";
import { unblockUser } from "../services/friends/unblockUser";
import { getBlockedUsers } from "../services/friends/getBlockedUsers";
import { pushFriendRequestEvent } from "../services/push/push";
import { emitFriendRequestBlocked } from "../sockets/friends";

const router = Router();

// GET /api/users/blocked — the blocker's own block list. Must be registered
// before /:userId/block so Express never treats "blocked" as a user id.
router.get(
  "/blocked",
  requireAuth,
  asyncHandler(async (req, res) => {
    const query = getBlockedUsersQuerySchema.safeParse(req.query);
    const { cursor, limit } = query.success ? query.data : {};

    const { blockedUsers, nextCursor } = await getBlockedUsers(req.user.id, {
      cursor,
      limit,
    });
    res.json({ ok: true, blockedUsers, nextCursor });
  }),
);

// POST /api/users/:userId/block — block a user. The blocker is the session
// user, never a body field.
router.post(
  "/:userId/block",
  requireAuth,
  asyncHandler(async (req, res) => {
    const myId = req.user.id;

    const { userId } = unwrapParsed(
      blockUserIdParamSchema.safeParse(req.params),
      { message: "userId missing" },
    );

    const { blockedUser } = await blockUser(myId, userId);

    // Tell the blocked user they were blocked so their client flips the
    // relationship to BLOCKED and drops any pending request card from us, and
    // push the same so they still learn about it with the app closed.
    const blockedBy = {
      id: req.user.id,
      username: req.user.username,
      displayName: req.user.displayName,
      avatar: req.user.avatar,
    };
    emitFriendRequestBlocked(req.io, userId, { blockedBy });
    await pushFriendRequestEvent({
      event: "blocked",
      requestId: userId,
      fromId: req.user.id,
      fromName: req.user.displayName ?? req.user.username,
      toUserId: userId,
    });

    res.status(201).json({ ok: true, blockedUser });
  }),
);

// DELETE /api/users/:userId/block — unblock a user (idempotent).
router.delete(
  "/:userId/block",
  requireAuth,
  asyncHandler(async (req, res) => {
    const myId = req.user.id;

    const { userId } = unwrapParsed(
      blockUserIdParamSchema.safeParse(req.params),
      { message: "userId missing" },
    );

    await unblockUser(myId, userId);

    res.json({ ok: true });
  }),
);

export default router;
