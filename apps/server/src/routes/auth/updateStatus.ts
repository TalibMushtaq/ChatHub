import { Router } from "express";
import requireAuth from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/async-handler";
import { updateStatusSchema } from "@repo/validators";
import {
  updateUserStatus,
  broadcastPresenceChanged,
} from "../../sockets/presence";

const router = Router();

/**
 * PATCH /auth/me/status
 *
 * Update the authenticated user's manual status and/or custom status.
 * Partial updates allowed; the response is the updated (id, status,
 * customStatus) so the client can refresh its own profile state.
 *
 * After persisting, the change is broadcast to every connected session via
 * `presence:changed` (real to the user's own tabs, gated to everyone else),
 * so the new status shows instantly everywhere.
 */
router.patch(
  "/me/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid status payload",
      });
    }

    const { status, customStatus } = parsed.data;

    if (status === undefined && customStatus === undefined) {
      return res.status(400).json({ ok: false, error: "Nothing to update" });
    }

    const user = await updateUserStatus(req.user.id, { status, customStatus });

    // Bust the session cache so GET /auth/me returns the fresh values.
    if (req.session.userCache) {
      req.session.userCache.cachedAt = 0;
    }

    await broadcastPresenceChanged(req.io, req.user.id);

    res.json({ ok: true, user });
  }),
);

export default router;
