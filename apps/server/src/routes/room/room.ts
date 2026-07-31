import { Router, Request, Response } from "express";
import requireAuth from "../../middleware/requireAuth";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../lib/AppError";
import { createRoomSchema } from "@repo/validators";
import joinRoomInvite from "./joinroominvite";
import joinRoomRequest from "./joinroomreq";
import joinRoomlink from "./joinroomlink";

const router = Router();

// join room routes

router.use(joinRoomInvite);
router.use(joinRoomRequest);
router.use(joinRoomlink);

/**
 * POST /rooms
 *
 * Creates a new chat room and adds the creator as OWNER.
 *
 * Improvements:
 * - Request body validated with Zod via createRoomSchema.
 * - Fixed typo: "discription" -> "description".
 * - Removed manual validation (Zod handles name/description checks).
 * - Route changed from POST /create to POST /rooms for REST consistency.
 */
router.post("/rooms", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const parsed = createRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }

    const { name, description } = parsed.data;

    const room = await prisma.chatRoom.create({
      data: {
        name,
        description: description || null,
        User: { connect: { id: userId } },
        ChatRoomMember: {
          create: {
            userId,
            role: "OWNER",
          },
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return res.status(201).json({ ok: true, room });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

/**
 * GET /rooms
 *
 * Lists rooms the authenticated user belongs to.
 *
 * Improvements:
 * - Replaced loading ALL members with:
 *   1. A single query for just the user's own membership (for myRole).
 *   2. A _count for total member count.
 *   This prevents O(n) member loading per room (1000 users = 1000 rows -> 1 row).
 * - Fixed typo: "discription" -> "description".
 * - Added pagination with take/cursor.
 * - Route unchanged (already RESTful: GET /rooms).
 */
router.get("/rooms", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const cursor = req.query.cursor as string | undefined;

    const rooms = await prisma.chatRoom.findMany({
      where: {
        ChatRoomMember: {
          some: {
            userId,
          },
        },
      },
      orderBy: [{ lastMessageAt: "desc" }, { id: "asc" }],
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      select: {
        id: true,
        name: true,
        description: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        // Only fetch the current user's membership — not every member
        ChatRoomMember: {
          where: { userId },
          select: { role: true },
        },
        // Use _count instead of loading all members
        _count: {
          select: { ChatRoomMember: true },
        },
        Message: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            content: true,
            messageType: true,
            createdAt: true,
            isDeleted: true,
          },
        },
      },
    });

    const hasMore = rooms.length > limit;
    const sliced = hasMore ? rooms.slice(0, limit) : rooms;

    const inbox = sliced.map((room) => ({
      roomId: room.id,
      name: room.name,
      description: room.description,
      createdBy: room.createdBy,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      myRole: room.ChatRoomMember[0]?.role ?? "MEMBER",
      lastMessage: room.Message[0] ?? null,
      memberCount: room._count.ChatRoomMember,
    }));

    return res.json({
      ok: true,
      rooms: inbox,
      nextCursor: hasMore ? sliced[sliced.length - 1]?.id ?? null : null,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

export default router;
