import { Router, Request, Response, NextFunction } from "express";
import requireAuth from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";
import { prisma } from "../../../db/prisma";
import { getPrismaErrorCode } from "../../lib/prismaError";
import { AppError } from "../../lib/AppError";
import { createJoinLinkSchema } from "@repo/validators";
import crypto from "crypto";

const router = Router();

/**
 * Hash a join token using SHA-256 before storing it in the database.
 *
 * Why: If the database is compromised, raw join tokens are useless to an
 * attacker — they can't be used to join rooms without the original value.
 * The raw token is only ever returned to the creator (once), and every
 * lookup hashes the incoming token before querying.
 */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * POST /:roomId/join-links
 *
 * Creates a shareable join link for a room. Only accessible by owners and admins.
 *
 * What it does:
 * - Verifies the requester has OWNER or ADMIN role in the room.
 * - Generates a random 12-byte token.
 * - Hashes the token with SHA-256 before storing it in the database.
 * - Returns the raw token to the creator (shown only once).
 *
 * Improvements:
 * - Token hashing: Raw tokens are never stored. If the DB is compromised,
 *   attackers get useless hashes. The raw token is only shown to the creator.
 * - Authorization extracted to requireAdmin middleware.
 * - Request body validated with Zod via createJoinLinkSchema.
 */
router.post(
  "/:roomId/join-links",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const myId = req.user!.id;
      const roomId = String(req.params.roomId);

      const parsed = createJoinLinkSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const rawToken = crypto.randomBytes(12).toString("hex");
      const hashedToken = hashToken(rawToken);

      const link = await prisma.roomJoinLink.create({
        data: {
          token: hashedToken,
          room: {
            connect: { id: roomId },
          },
          createdBy: {
            connect: { id: myId },
          },
          ...(parsed.data.maxUses && { maxUses: parsed.data.maxUses }),
          ...(parsed.data.expiresAt && {
            expiresAt: new Date(parsed.data.expiresAt),
          }),
        },
        select: {
          id: true,
          token: true,
          maxUses: true,
          expiresAt: true,
        },
      });

      return res.status(201).json({
        ok: true,
        link: {
          id: link.id,
          token: rawToken,
          maxUses: link.maxUses,
          expiresAt: link.expiresAt,
        },
      });
    } catch (err) {
      return next(err);
    }
  },
);

/**
 * GET /join/:token
 *
 * Validates a join link token and returns room info. Used before actually joining.
 *
 * What it does:
 * - Hashes the incoming token before looking it up (tokens are stored hashed).
 * - Checks the link is active, not expired, and hasn't exceeded maxUses.
 * - Returns room metadata (name, description) for preview/confirmation.
 *
 * Improvements:
 * - Token hashing: Incoming token is hashed before DB lookup, matching the
 *   hashed storage format from the create endpoint.
 */
router.get(
  "/join/:token",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawToken = String(req.params.token);
      const hashedToken = hashToken(rawToken);
      const link = await prisma.roomJoinLink.findUnique({
        where: { token: hashedToken },
        select: {
          token: true,
          isActive: true,
          usedCount: true,
          expiresAt: true,
          maxUses: true,
          room: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
      });
      const now = new Date();
      if (!link)
        return res
          .status(404)
          .json({ ok: false, error: "link does not exist or is deleted" });
      if (!link.isActive)
        return res.status(410).json({ ok: false, error: "link is not usable" });
      if (link.maxUses !== null && link.usedCount >= link.maxUses)
        return res.status(410).json({ ok: false, error: "max uses reached" });
      if (link.expiresAt && link.expiresAt < now)
        return res.status(410).json({ ok: false, error: "link expired" });

      return res.status(200).json({
        ok: true,
        room: link.room,
        expiresAt: link.expiresAt,
        maxUses: link.maxUses,
      });
    } catch (err) {
      return next(err);
    }
  },
);

/**
 * POST /join/:token
 *
 * Joins a room using a valid join link token.
 *
 * What it does:
 * - Hashes the incoming token before looking it up.
 * - Validates the link is active, not expired, and not at maxUses.
 * - Atomically reserves a slot (if maxUses is set) using conditional updateMany
 *   to prevent race conditions where two users could exceed the limit.
 * - Checks the user is not already a member.
 * - Adds the user as a MEMBER of the room.
 * - Increments usedCount for tracking (for both limited and unlimited links).
 *
 * Improvements:
 * - Token hashing: Incoming token is hashed before DB lookup.
 * - Atomic slot reservation: updateMany with `where: { usedCount: { lt: maxUses } }`
 *   ensures only one transaction can claim the last slot. If count === 0, someone
 *   else claimed it first -> 410 Gone.
 * - Error handling uses AppError consistently.
 */
router.post(
  "/join/:token",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const rawToken = String(req.params.token);
      const hashedToken = hashToken(rawToken);

      await prisma.$transaction(async (tx) => {
        const link = await tx.roomJoinLink.findUnique({
          where: { token: hashedToken },
        });

        if (!link) {
          throw new AppError("Link not found", 404);
        }

        const now = new Date();

        if (!link.isActive) {
          throw new AppError("Link is no longer valid", 410);
        }

        if (link.expiresAt && link.expiresAt < now) {
          throw new AppError("Link is no longer valid", 410);
        }

        // Atomic reservation: try to claim a slot before joining.
        // If maxUses is null (unlimited), skip the check.
        // If maxUses is set, only increment if usedCount < maxUses.
        // If the update affects 0 rows, someone else claimed the last slot.
        if (link.maxUses !== null) {
          const updated = await tx.roomJoinLink.updateMany({
            where: {
              id: link.id,
              usedCount: { lt: link.maxUses },
            },
            data: {
              usedCount: { increment: 1 },
            },
          });

          if (updated.count === 0) {
            throw new AppError("Link is no longer valid", 410);
          }
        }

        const member = await tx.chatRoomMember.findUnique({
          where: {
            userId_chatRoomId: {
              userId,
              chatRoomId: link.roomId,
            },
          },
        });

        if (member) {
          throw new AppError("Already a member", 409);
        }

        await tx.chatRoomMember.create({
          data: {
            User: { connect: { id: userId } },
            ChatRoom: { connect: { id: link.roomId } },
            role: "MEMBER",
          },
        });

        // Increment usedCount for unlimited links (no maxUses cap)
        if (link.maxUses === null) {
          await tx.roomJoinLink.update({
            where: { id: link.id },
            data: {
              usedCount: { increment: 1 },
            },
          });
        }
      });

      return res.status(200).json({ ok: true });
    } catch (err: unknown) {
      const code = getPrismaErrorCode(err);
      if (code === "P2002") {
        return res.status(409).json({
          ok: false,
          error: "Already a member",
        });
      }

      return next(err);
    }
  },
);

/**
 * PATCH /:roomId/join-links/:linkId
 *
 * Deactivates a join link. Only accessible by owners and admins.
 *
 * What it does:
 * - Verifies the requester has OWNER or ADMIN role in the room.
 * - Sets isActive to false, preventing further joins via this link.
 * - Existing users who already joined are not affected.
 *
 * Improvements:
 * - Authorization extracted to requireAdmin middleware.
 */
router.patch(
  "/:roomId/join-links/:linkId",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params.roomId);
      const linkId = String(req.params.linkId);

      const link = await prisma.roomJoinLink.findUnique({
        where: { id: linkId },
        select: { id: true, roomId: true, isActive: true },
      });

      if (!link || link.roomId !== roomId) {
        return res.status(404).json({
          ok: false,
          error: "Link not found",
        });
      }

      await prisma.roomJoinLink.update({
        where: { id: linkId },
        data: { isActive: false },
      });

      return res.status(200).json({
        ok: true,
        message: "Link deactivated",
      });
    } catch (err) {
      return next(err);
    }
  },
);

/**
 * GET /join-links/mine
 *
 * Lists all join links created by the authenticated user.
 *
 * What it does:
 * - Returns all links where the current user is the creator.
 * - Includes room name, usage stats, and active status.
 *
 * Improvements: None — this is a read-only endpoint.
 */
router.get(
  "/join-links/mine",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      const links = await prisma.roomJoinLink.findMany({
        where: {
          createdById: userId,
        },
        select: {
          id: true,
          token: true,
          maxUses: true,
          usedCount: true,
          expiresAt: true,
          isActive: true,
          createdAt: true,
          room: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return res.status(200).json({
        ok: true,
        links,
      });
    } catch (err) {
      return next(err);
    }
  },
);

export default router;
