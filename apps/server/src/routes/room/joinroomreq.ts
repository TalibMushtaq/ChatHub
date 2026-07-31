import { Router, Request, Response } from "express";
import { prisma } from "../../../db/prisma";
import requireAuth from "../../middleware/requireAuth";
const router = Router();

class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * POST /:roomId/join-request
 *
 * Allows a user to request to join a chat room.
 *
 * What it does:
 * - Verifies the user is not already a member of the room.
 * - Prevents owners/admins from sending a join request (they already have access).
 * - Prevents duplicate pending requests from the same user.
 * - Creates the join request record.
 *
 * Improvements:
 * - Removed the `chatRoom.findUnique` query. If the room doesn't exist, the
 *   foreign key constraint on `chatRoomId` will throw a P2003 error, which we
 *   catch and return as a 404. This eliminates one unnecessary DB roundtrip.
 * - Wrapped the member check, pending check, and create in a `prisma.$transaction`
 *   to prevent race conditions where two simultaneous requests could both pass
 *   the duplicate check.
 * - Added structured error handling for P2003 (foreign key = room not found)
 *   and P2002 (unique constraint = pending request already exists).
 */
router.post(
  "/:roomId/join-request",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const roomId = String(req.params.roomId);

      const joinRequest = await prisma.$transaction(async (tx) => {
        const existingMember = await tx.chatRoomMember.findUnique({
          where: {
            userId_chatRoomId: {
              userId,
              chatRoomId: roomId,
            },
          },
          select: { role: true },
        });

        if (existingMember) {
          if (["OWNER", "ADMIN"].includes(existingMember.role)) {
            throw new AppError("Owner or admin cannot self-invite", 400);
          }
          throw new AppError("Already a member", 400);
        }

        const existingPending = await tx.roomJoinRequest.findFirst({
          where: {
            roomId,
            userId,
            status: "PENDING",
          },
          select: { id: true },
        });

        if (existingPending) {
          throw new AppError("You already have a pending request", 400);
        }

        return tx.roomJoinRequest.create({
          data: {
            roomId,
            userId,
          },
        });
      });

      return res.status(201).json({ ok: true, joinRequest });
    } catch (err: any) {
      if (err instanceof AppError) {
        return res.status(err.statusCode).json({
          ok: false,
          error: err.message,
        });
      }

      if (err?.code === "P2003") {
        return res.status(404).json({
          ok: false,
          error: "Room not found",
        });
      }

      if (err?.code === "P2002") {
        return res.status(409).json({
          ok: false,
          error: "You already have a pending request",
        });
      }

      console.log(err);
      return res.status(500).json({
        ok: false,
        error: "Server error",
      });
    }
  },
);

/**
 * GET /:roomId/join-requests
 *
 * Lists all join requests for a room. Only accessible by owners and admins.
 *
 * What it does:
 * - Verifies the requester has an OWNER or ADMIN role in the room.
 * - Returns all join requests (optionally filtered by status via query param).
 * - Includes the requesting user and the reviewer (if reviewed) in the response.
 *
 * Improvements: None — this is a read-only endpoint with no write-side concerns.
 */
router.get(
  "/:roomId/join-requests",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const roomId = String(req.params.roomId);
      const status = req.query.status as
        | "PENDING"
        | "APPROVED"
        | "REJECTED"
        | undefined;

      // 1️⃣ Ensure requester is OWNER or ADMIN
      const membership = await prisma.chatRoomMember.findUnique({
        where: {
          userId_chatRoomId: {
            userId: userId,
            chatRoomId: roomId,
          },
        },
      });

      if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const requests = await prisma.roomJoinRequest.findMany({
        where: {
          roomId,
          ...(status && { status }),
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
          reviewedBy: {
            select: {
              id: true,
              username: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return res.json({
        ok: true,
        requests,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
 * PATCH /:roomId/join-requests/:requestId
 *
 * Approve or reject a pending join request. Only accessible by owners and admins.
 *
 * What it does:
 * - Verifies the reviewer has OWNER or ADMIN role in the room.
 * - Validates the request exists, belongs to the room, and is still PENDING.
 * - On APPROVE: adds the user as a MEMBER and updates the request status.
 * - On REJECT: updates the request status without adding the user.
 *
 * Improvements:
 * - The member creation and request status update are wrapped in a transaction
 *   to ensure atomicity — either both succeed or neither does.
 */
router.patch(
  "/:roomId/join-requests/:requestId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const reviewerId = req.user!.id;
      const roomId = String(req.params.roomId);
      const requestId = String(req.params.requestId);
      const { action } = req.body;

      if (!["APPROVED", "REJECTED"].includes(action)) {
        return res.status(400).json({ error: "Invalid action" });
      }
      const access = await prisma.chatRoomMember.findUnique({
        where: {
          userId_chatRoomId: {
            userId: reviewerId,
            chatRoomId: roomId,
          },
        },
        select: {
          role: true,
        },
      });
      if (!access || (access.role !== "ADMIN" && access.role !== "OWNER")) {
        return res.status(403).json({ ok: false, error: "Not Authorized" });
      }

      const request = await prisma.roomJoinRequest.findUnique({
        where: {
          id: requestId,
        },
      });

      if (!request || request.roomId !== roomId)
        return res.status(404).json({ ok: false, error: "request not found" });

      if (request.status !== "PENDING") {
        return res
          .status(400)
          .json({ ok: false, error: "request already reviewed" });
      }

      await prisma.$transaction(async (tx) => {
        if (action === "APPROVED") {
          await tx.chatRoomMember.create({
            data: {
              chatRoomId: roomId,
              userId: request.userId,
              role: "MEMBER",
            },
          });
        }

        await tx.roomJoinRequest.update({
          where: { id: requestId },
          data: {
            status: action === "APPROVED" ? "APPROVED" : "REJECTED",
            reviewedById: reviewerId,
            reviewedAt: new Date(),
          },
        });
      });

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.log(err);
      return res.status(500).json({
        ok: false,
        error: "Server Error",
      });
    }
  },
);

export default router;
