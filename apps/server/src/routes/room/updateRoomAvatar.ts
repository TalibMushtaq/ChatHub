import express from "express";
import type { Request, Response } from "express";
import requireAuth from "../../middleware/requireAuth";
import { prisma } from "../../../db/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { createLogger } from "../../lib/logger";
import { z } from "zod";
import { getRequiredS3Service } from "../../lib/s3";

const router = express.Router();
const log = createLogger("updateRoomAvatar");

/**
 * Room avatar key validation.
 *
 * Accepts:
 *   1. defaults/room/{filename}.png — a reference to an existing default
 *   2. avatars/rooms/{roomId}/...   — a room-specific uploaded avatar
 */
const roomAvatarKeySchema = z.union([
  z
    .string()
    .regex(
      /^defaults\/room\/[^/]+\.png$/,
      "Invalid default room avatar reference",
    ),
  z
    .string()
    .regex(/^avatars\/rooms\/[^/]+\/.+/, "Invalid room avatar key format"),
]);

/**
 * PATCH /rooms/:roomId/avatar
 *
 * Updates the room's avatar. Only OWNER or ADMIN may change the avatar.
 */
router.patch(
  "/:roomId/avatar",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user.id;
    const roomId = String(req.params.roomId ?? "");

    if (!roomId) {
      res.status(400).json({ ok: false, error: "roomId is required" });
      return;
    }

    // Verify the user is OWNER or ADMIN
    const membership = await prisma.chatRoomMember.findUnique({
      where: { userId_chatRoomId: { userId, chatRoomId: roomId } },
      select: { role: true },
    });

    if (!membership) {
      res.status(403).json({ ok: false, error: "Not a member of this room" });
      return;
    }

    if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
      res.status(403).json({
        ok: false,
        error: "Only owners and admins can change the room avatar",
      });
      return;
    }

    const parsed = z
      .object({ avatarKey: roomAvatarKeySchema })
      .safeParse(req.body);
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
    const before = await prisma.chatRoom.findUnique({
      where: { id: roomId },
      select: { avatar: true },
    });

    await prisma.chatRoom.update({
      where: { id: roomId },
      data: { avatar: avatarKey },
    });

    log.info("Room avatar updated", { userId, roomId, avatarKey });

    res.json({ ok: true, avatarKey });

    // Best-effort S3 cleanup of the replaced custom avatar. Fire-and-forget
    // after the response so an S3 hiccup never fails the DB update.
    const oldKey = before?.avatar ?? null;
    if (oldKey && oldKey.startsWith("avatars/") && oldKey !== avatarKey) {
      try {
        await getRequiredS3Service().deleteObject(oldKey);
        log.info("Deleted replaced room avatar", { roomId, oldKey });
      } catch (err) {
        log.error("Failed to delete replaced room avatar", {
          roomId,
          oldKey,
          error: err,
        });
      }
    }
  }),
);

export default router;
