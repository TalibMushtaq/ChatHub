import { Router, Request, Response } from "express";
import { prisma } from "../../../db/prisma";
import requireAuth from "../../middleware/requireAuth";
const router = Router();

router.post(
  "/:roomId/join-request",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const roomId = String(req.params.roomId);

      const room = await prisma.chatRoom.findUnique({
        where: {
          id: roomId,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (!room)
        return res.status(404).json({ ok: false, error: "Room not found" });

      const existingMember = await prisma.chatRoomMember.findUnique({
        where: {
          userId_chatRoomId: {
            userId: userId,
            chatRoomId: room.id,
          },
        },
      });

      if (existingMember)
        return res.status(400).json({ ok: false, error: "Already a member" });

      const existingPending = await prisma.roomJoinRequest.findFirst({
        where: {
          roomId,
          userId,
          status: "PENDING",
        },
        select: { id: true },
      });

      if (existingPending) {
        return res.status(400).json({
          error: "You already have a pending request",
          reqId: existingPending.id,
        });
      }

      const joinRequest = await prisma.roomJoinRequest.create({
        data: {
          roomId: room.id,
          userId: userId,
        },
      });

      return res.status(201).json({ ok: true, joinRequest });
    } catch (err) {
      console.log(err);
      return res.status(500).json({
        ok: false,
        error: "Server error",
      });
    }
  },
);

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
