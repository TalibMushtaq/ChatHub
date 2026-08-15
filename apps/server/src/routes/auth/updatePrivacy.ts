import { Router } from "express";
import { prisma } from "../../../db/prisma";
import requireAuth from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/async-handler";
import { updatePrivacySchema } from "@repo/validators";
import { syncPrivacyFlags } from "../../services/presence";
import {
  broadcastPresenceChanged,
  broadcastPresenceHidden,
} from "../../sockets/presence";

const router = Router();

/**
 * PATCH /auth/me/privacy
 *
 * Toggle which presence information the authenticated user shares with other
 * users (never what they can see themselves):
 * - showOnlineStatus: whether others see them as online/idle/offline
 * - showTypingStatus: whether others see their typing indicator
 *
 * Persists to Postgres, syncs the flags into the presence blob (so the
 * broadcast gate reads fresh values without a DB hit per event), and pushes a
 * one-time "offline" to others when online sharing is turned off so any cached
 * online dot clears immediately.
 */
router.patch(
  "/me/privacy",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = updatePrivacySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid privacy payload",
      });
    }

    const { showOnlineStatus, showTypingStatus } = parsed.data;

    if (showOnlineStatus === undefined && showTypingStatus === undefined) {
      return res.status(400).json({ ok: false, error: "Nothing to update" });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(showOnlineStatus !== undefined && { showOnlineStatus }),
        ...(showTypingStatus !== undefined && { showTypingStatus }),
      },
      select: {
        id: true,
        showOnlineStatus: true,
        showTypingStatus: true,
      },
    });

    await syncPrivacyFlags(req.user.id, {
      showOnlineStatus: user.showOnlineStatus,
      showTypingStatus: user.showTypingStatus,
    });

    // Bust the session cache so GET /auth/me returns the fresh flags.
    if (req.session.userCache) {
      req.session.userCache.cachedAt = 0;
    }

    // When the user hides online presence, clear any presence other clients
    // already cached for them. Invisible users still get their own real
    // presence via broadcastPresenceChanged (which reads the now-hidden blob).
    if (showOnlineStatus === false) {
      broadcastPresenceHidden(req.io, req.user.id);
    } else {
      await broadcastPresenceChanged(req.io, req.user.id);
    }

    res.json({ ok: true, user });
  }),
);

export default router;
