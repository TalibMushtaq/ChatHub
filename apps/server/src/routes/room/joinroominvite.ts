import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../../../db/prisma";
import { getPrismaErrorCode } from "../../lib/prismaError";
import requireAuth from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";
import { AppError } from "../../lib/AppError";
import {
  sendInvitationSchema,
  respondInvitationSchema,
} from "@repo/validators";

const router = Router();

/**
 * POST /:roomId/invitations
 *
 * Allows an owner/admin to invite a user to a chat room.
 *
 * What it does:
 * - Prevents self-invites (admin cannot invite themselves).
 * - Verifies the inviter has OWNER or ADMIN role in the room.
 * - Checks the target user is not already a member.
 * - Checks there is no existing pending invitation for the same user/room.
 * - Creates the invitation record.
 *
 * Improvements:
 * - Removed the `user.findUnique` query. If the target user doesn't exist,
 *   the foreign key constraint on `invitedUserId` will throw a P2003 error,
 *   which we catch and return as a 404. This eliminates one unnecessary DB
 *   roundtrip on every invitation.
 * - Wrapped the membership check, pending check, and create in a
 *   `prisma.$transaction` to prevent race conditions where two simultaneous
 *   invites could both pass the duplicate check.
 * - Added structured error handling for P2003 (foreign key = user not found)
 *   and P2002 (unique constraint = invitation already sent).
 * - Request body validated with Zod via sendInvitationSchema.
 * - Authorization extracted to requireAdmin middleware.
 */
router.post(
  "/:roomId/invitations",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const myId = req.user?.id;
      if (!myId) {
        return res.status(401).json({ ok: false, error: "Not authenticated" });
      }
      const roomId = String(req.params.roomId);

      const parsed = sendInvitationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const targetUserId: string = parsed.data.targetUserId;

      if (targetUserId === myId) {
        return res
          .status(400)
          .json({ ok: false, error: "Cannot invite yourself" });
      }

      const sent = await prisma.$transaction(async (tx) => {
        const isMember = await tx.chatRoomMember.findUnique({
          where: {
            userId_chatRoomId: {
              userId: targetUserId,
              chatRoomId: roomId,
            },
          },
          select: {
            joinedAt: true,
            role: true,
          },
        });

        if (isMember) {
          throw new AppError("Already a Member", 409);
        }

        const pending = await tx.roomInvitation.findFirst({
          where: {
            roomId: roomId,
            invitedUserId: targetUserId,
            status: "PENDING",
          },
          select: {
            id: true,
          },
        });

        if (pending) {
          throw new AppError("Invitation already sent", 409);
        }

        return tx.roomInvitation.create({
          data: {
            roomId: roomId,
            invitedUserId: targetUserId,
            invitedById: myId,
          },
          select: {
            id: true,
            createdAt: true,
            status: true,
          },
        });
      });

      return res.status(201).json({
        ok: true,
        id: sent.id,
        createdAt: sent.createdAt,
        status: sent.status,
      });
    } catch (err: unknown) {
      const code = getPrismaErrorCode(err);
      if (code === "P2003") {
        return res.status(404).json({
          ok: false,
          error: "Target user doesn't exist",
        });
      }

      if (code === "P2002") {
        return res.status(409).json({
          ok: false,
          error: "Invitation already sent",
        });
      }

      return next(err);
    }
  },
);

/**
 * GET /invitation/sent
 *
 * Lists all pending invitations sent by the authenticated user.
 *
 * What it does:
 * - Returns all PENDING invitations where the current user is the inviter.
 * - Includes the room name and invited user details in the response.
 *
 * Improvements: None — this is a read-only endpoint.
 */
router.get(
  "/invitation/sent",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const myId = req.user!.id;
      const invitations = await prisma.roomInvitation.findMany({
        where: {
          invitedById: myId,
          status: "PENDING",
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          room: {
            select: {
              id: true,
              name: true,
            },
          },
          invitedUser: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      return res.status(200).json({ ok: true, invitations });
    } catch (err) {
      return next(err);
    }
  },
);

/**
 * GET /invitation/received
 *
 * Lists all pending invitations received by the authenticated user.
 *
 * What it does:
 * - Returns all PENDING invitations where the current user is the invitee.
 * - Includes the room name and inviter details in the response.
 *
 * Improvements: None — this is a read-only endpoint.
 */
router.get(
  "/invitation/received",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const myId = req.user!.id;

      const invitations = await prisma.roomInvitation.findMany({
        where: {
          invitedUserId: myId,
          status: "PENDING",
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          createdAt: true,
          room: {
            select: {
              id: true,
              name: true,
            },
          },
          invitedBy: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      return res.status(200).json({
        ok: true,
        invitations,
      });
    } catch (err) {
      return next(err);
    }
  },
);

/**
 * PATCH /invitations/:invitationId
 *
 * Accept or reject a received invitation.
 *
 * What it does:
 * - Validates the status value is either ACCEPTED or REJECTED.
 * - On REJECT: updates the invitation status directly.
 * - On ACCEPTED: atomically verifies the invitation is valid and pending,
 *   updates the status, and adds the user as a MEMBER of the room.
 *
 * Improvements:
 * - The accept flow (verify + update + add member) is wrapped in a transaction
 *   to prevent race conditions (e.g., accepting an already-processed invitation).
 * - Added P2002 handling for the unique constraint on room membership, returning
 *   a clear "User is already a member" error instead of a generic 500.
 * - Request body validated with Zod via respondInvitationSchema.
 */
router.patch(
  "/invitations/:invitationId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const myId = req.user!.id;
      const invitationId = String(req.params.invitationId);

      const parsed = respondInvitationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { status } = parsed.data;

      if (status === "REJECTED") {
        const result = await prisma.roomInvitation.updateMany({
          where: {
            id: invitationId,
            invitedUserId: myId,
            status: "PENDING",
          },
          data: {
            status: "REJECTED",
          },
        });

        if (result.count === 0) {
          return res.status(409).json({
            ok: false,
            error: "Invitation not found or already processed",
          });
        }

        return res.status(200).json({ ok: true, status: "REJECTED" });
      }

      if (status === "ACCEPTED") {
        await prisma.$transaction(async (tx) => {
          const invitation = await tx.roomInvitation.findUnique({
            where: { id: invitationId },
            select: {
              id: true,
              roomId: true,
              invitedUserId: true,
              status: true,
            },
          });

          if (!invitation) throw new AppError("Invitation not found", 404);

          if (invitation.invitedUserId !== myId)
            throw new AppError("Not authorized", 403);

          if (invitation.status !== "PENDING")
            throw new AppError("Invitation already processed", 409);

          await tx.roomInvitation.update({
            where: { id: invitationId },
            data: { status: "ACCEPTED" },
          });

          await tx.chatRoomMember.create({
            data: {
              userId: myId,
              chatRoomId: invitation.roomId,
              role: "MEMBER",
            },
          });
        });

        return res.status(200).json({
          ok: true,
          status: "ACCEPTED",
        });
      }

      // Unreachable while respondInvitationSchema only allows the two
      // statuses above; without it an unhandled status would hang the request.
      return res.status(400).json({ ok: false, error: "Invalid status" });
    } catch (err: unknown) {
      const code = getPrismaErrorCode(err);
      if (code === "P2002") {
        return res.status(409).json({
          ok: false,
          error: "User is already a member",
        });
      }

      return next(err);
    }
  },
);

export default router;
