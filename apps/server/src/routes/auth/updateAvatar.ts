import express from "express";
import type { Request, Response } from "express";
import requireAuth from "../../middleware/requireAuth";
import { prisma } from "../../../db/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { createLogger } from "../../lib/logger";
import { z } from "zod";
import { getRequiredS3Service } from "../../lib/s3";

const router = express.Router();
const log = createLogger("updateAvatar");

/**
 * Avatar key validation.
 *
 * Accepts two forms:
 *   1. defaults/{user|room}/{filename}.png — a reference to an existing default
 *   2. avatars/{userId}/...               — a user-uploaded avatar key
 *
 * The server does not upload or copy files; it only stores the key reference.
 */
const avatarKeySchema = z.union([
  // Default avatar reference: only user defaults are valid for user avatars
  z
    .string()
    .regex(/^defaults\/user\/[^/]+\.png$/, "Invalid default avatar reference"),
  // User-uploaded avatar key
  z.string().regex(/^avatars\/[^/]+\/.+/, "Invalid avatar key format"),
]);

/**
 * PATCH /auth/me/avatar
 *
 * Updates the authenticated user's avatar to either:
 *   - A default avatar reference (defaults/user/NN.png)
 *   - A custom uploaded avatar S3 key (avatars/{userId}/...)
 *
 * Does NOT validate that the S3 object actually exists — that responsibility
 * rests with the client which either picked from /defaults/avatars or
 * completed an upload presign flow.
 */
router.patch(
  "/me/avatar",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user.id;

    const parsed = z.object({ avatarKey: avatarKeySchema }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid avatar key",
      });
      return;
    }

    const { avatarKey } = parsed.data;

    // Read the old avatar before writing so a replaced custom upload can be
    // cleaned up afterwards — defaults are shared, so they're never deleted.
    const before = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatar: true },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarKey },
    });

    // Bust the session cache so the next requireAuth re-fetches the updated user
    if (req.session.userCache) {
      req.session.userCache.cachedAt = 0;
    }

    log.info("User avatar updated", { userId, avatarKey });

    res.json({ ok: true, avatarKey });

    // Best-effort S3 cleanup of the replaced custom avatar. Deletion is
    // fire-and-forget after the response so an S3 hiccup never surfaces as
    // a failed avatar update (the DB row is already authoritative).
    const oldKey = before?.avatar ?? null;
    if (oldKey && oldKey.startsWith("avatars/") && oldKey !== avatarKey) {
      try {
        await getRequiredS3Service().deleteObject(oldKey);
        log.info("Deleted replaced user avatar", { userId, oldKey });
      } catch (err) {
        log.error("Failed to delete replaced user avatar", {
          userId,
          oldKey,
          error: err,
        });
      }
    }
  }),
);

export default router;
