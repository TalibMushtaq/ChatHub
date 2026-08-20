import { Router, Request, Response } from "express";
import requireAuth from "../../middleware/requireAuth";
import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";
import { assertRoleAtLeast } from "../../services/room/permissions";
import { roomNotificationPrefSchema } from "@repo/validators";

export const notificationPrefsRouter = Router();

type AuthenticatedRequest = Request & { user: { id: string } };

/**
 * GET /rooms/:roomId/notification-prefs
 * Returns the calling user's notification preference for this room.
 */
notificationPrefsRouter.get(
  "/:roomId",
  requireAuth,
  async (req: Request, res: Response) => {
    const r = req as AuthenticatedRequest;
    const roomId = r.params.roomId as string;
    const userId = r.user.id;

    const membership = await prisma.chatRoomMember.findUnique({
      where: {
        userId_chatRoomId: {
          userId,
          chatRoomId: roomId,
        },
      },
      select: { notificationPref: true },
    });

    if (!membership) {
      throw new ApiError("Not a member of this room", 403, "FORBIDDEN");
    }

    res.json({ ok: true, notificationPref: membership.notificationPref });
  },
);

/**
 * PATCH /rooms/:roomId/notification-prefs
 * Updates the calling user's notification preference for this room.
 */
notificationPrefsRouter.patch(
  "/:roomId",
  requireAuth,
  async (req: Request, res: Response) => {
    const r = req as AuthenticatedRequest;
    const roomId = r.params.roomId as string;
    const userId = r.user.id;

    const parsed = roomNotificationPrefSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }

    await assertRoleAtLeast(userId, roomId, "MEMBER");

    const updated = await prisma.chatRoomMember.update({
      where: {
        userId_chatRoomId: {
          userId,
          chatRoomId: roomId,
        },
      },
      data: { notificationPref: parsed.data.notificationPref },
      select: { notificationPref: true },
    });

    res.json({ ok: true, notificationPref: updated.notificationPref });
  },
);
