import express from "express";
import type { Request, Response } from "express";
import requireAuth from "../../middleware/requireAuth";
import { prisma } from "../../../db/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { createLogger } from "../../lib/logger";
import { z } from "zod";

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
 * PATCH /rooms/:chatRoomId/avatar
 *
 * Updates the room's avatar. Only OWNER or ADMIN may change the avatar.
 */
router.patch(
  "/:chatRoomId/avatar",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user.id;
    const chatRoomId = String(req.params.chatRoomId ?? "");

    if (!chatRoomId) {
      res.status(400).json({ ok: false, error: "chatRoomId is required" });
      return;
    }

    // Verify the user is OWNER or ADMIN
    const membership = await prisma.chatRoomMember.findUnique({
      where: { userId_chatRoomId: { userId, chatRoomId } },
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

    await prisma.chatRoom.update({
      where: { id: chatRoomId },
      data: { avatar: avatarKey },
    });

    log.info("Room avatar updated", { userId, chatRoomId, avatarKey });

    res.json({ ok: true, avatarKey });
  }),
);

export default router;
