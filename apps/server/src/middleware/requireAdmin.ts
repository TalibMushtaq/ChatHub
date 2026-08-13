import type { Request, Response, NextFunction } from "express";
import { prisma } from "../../db/prisma";

/**
 * Middleware factory: ensures the authenticated user has OWNER or ADMIN role
 * in the room specified by `req.params.roomId`.
 *
 * Why: Every admin-only endpoint repeats the same findUnique + role check.
 * This extracts that into a single reusable middleware.
 *
 * Usage: router.get("/:roomId/foo", requireAuth, requireAdmin, handler)
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;
  const roomId = String(req.params.roomId);

  prisma.chatRoomMember
    .findUnique({
      where: {
        userId_chatRoomId: {
          userId,
          chatRoomId: roomId,
        },
      },
      select: { role: true },
    })
    .then((membership) => {
      if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
        return res.status(403).json({ ok: false, error: "Not authorized" });
      }

      // Attach membership to request for downstream handlers
      req.membership = membership;
      next();
    })
    .catch((err) => {
      next(err);
    });
}
