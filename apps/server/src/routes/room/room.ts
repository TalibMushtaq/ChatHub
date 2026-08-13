import { Router, Request, Response, NextFunction } from "express";
import requireAuth from "../../middleware/requireAuth";
import { prisma } from "../../../db/prisma";
import {
  createRoomSchema,
  chatRoomIdParamSchema,
  markReadSchema,
  getMessagesSchema,
} from "@repo/validators";
import { assertRoomAccess } from "../../middleware/socketAccess";
import { asyncHandler } from "../../middleware/async-handler";
import { markRoomRead } from "../../services/room/markRead";
import { getMessages } from "../../services/room/getMessages";
import { getMembers } from "../../services/room/getMembers";
import { createRateLimiter, setRateLimitHeaders } from "../../lib/rateLimiter";
import joinRoomInvite from "./joinroominvite";
import joinRoomRequest from "./joinroomreq";
import joinRoomlink from "./joinroomlink";
import updateRoomAvatarRouter from "./updateRoomAvatar";

const router = Router();

// join room routes

router.use(joinRoomInvite);
router.use(joinRoomRequest);
router.use(joinRoomlink);
router.use(updateRoomAvatarRouter);

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
router.post(
  "/rooms",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      const parsed = createRoomSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { name, description, avatarKey } = parsed.data;

      const room = await prisma.chatRoom.create({
        data: {
          name,
          description: description || null,
          ...(avatarKey ? { avatar: avatarKey } : {}),
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
          avatar: true,
        },
      });
      return res.status(201).json({ ok: true, room });
    } catch (err) {
      return next(err);
    }
  },
);

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
router.get(
  "/rooms",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
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
          avatar: true,
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

      // Batch-fetch read receipts and compute unread counts (no N+1).
      const roomIds = sliced.map((r) => r.id);

      // Batch-compute unread counts using a single raw query.
      const unreadRows = roomIds.length
        ? await prisma.$queryRaw<{ chatRoomId: string; count: bigint }[]>`
          SELECT
            m."chatRoomId" as "chatRoomId",
            COUNT(*)::int as count
          FROM "Message" m
          LEFT JOIN "ChatRoomReadReceipt" r
            ON r."userId" = ${userId}
            AND r."chatRoomId" = m."chatRoomId"
          WHERE m."chatRoomId" = ANY(${roomIds})
            AND m."senderId" != ${userId}
            AND m."isDeleted" = false
            AND (
              r."lastReadMessageCreatedAt" IS NULL
              OR m."createdAt" > r."lastReadMessageCreatedAt"
            )
          GROUP BY m."chatRoomId"
        `
        : [];

      const unreadMap = new Map(
        unreadRows.map((row) => [row.chatRoomId, Number(row.count)]),
      );

      const inbox = sliced.map((room) => ({
        roomId: room.id,
        name: room.name,
        description: room.description,
        avatar: room.avatar,
        createdBy: room.createdBy,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        myRole: room.ChatRoomMember[0]?.role ?? "MEMBER",
        lastMessage: room.Message[0] ?? null,
        memberCount: room._count.ChatRoomMember,
        unreadCount: unreadMap.get(room.id) ?? 0,
      }));

      return res.json({
        ok: true,
        rooms: inbox,
        nextCursor: hasMore ? (sliced[sliced.length - 1]?.id ?? null) : null,
      });
    } catch (err) {
      return next(err);
    }
  },
);

// GET /:chatRoomId/messages
// Returns the room's message timeline with cursor pagination (same contract as
// the direct-chat GET /:directChatId/messages so the web client can reuse its
// timeline hook). Access is gated by room membership.
router.get(
  "/:chatRoomId/messages",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const params = chatRoomIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ ok: false, error: "chatRoomId missing" });
      return;
    }
    const chatRoomId = params.data.chatRoomId;

    await assertRoomAccess(userId, chatRoomId);

    const query = getMessagesSchema.safeParse(req.query);
    const { cursor, limit, direction } = query.success ? query.data : {};

    const { messages, nextCursor } = await getMessages(chatRoomId, {
      cursor,
      limit,
      direction,
    });
    res.json({ ok: true, messages, nextCursor });
  }),
);

// GET /:chatRoomId/members
// Lists the room's members (user info + role) for the room info panel.
// Access is gated by room membership.
router.get(
  "/:chatRoomId/members",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const params = chatRoomIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ ok: false, error: "chatRoomId missing" });
      return;
    }
    const chatRoomId = params.data.chatRoomId;

    await assertRoomAccess(userId, chatRoomId);

    const members = await getMembers(chatRoomId);
    res.json({ ok: true, members });
  }),
);

const markReadLimiter = createRateLimiter({
  maxAttempts: 120,
  windowMs: 60_000,
  prefix: "room:markread",
});

// POST /:chatRoomId/mark-read
// Uses asyncHandler so ApiError statuses (403 FORBIDDEN, 404 MESSAGE_NOT_FOUND,
// 400 MESSAGE_WRONG_ROOM) reach the shared error handler instead of being
// flattened into a 500 by a local try/catch.
router.post(
  "/:chatRoomId/mark-read",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const params = chatRoomIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ ok: false, error: "chatRoomId missing" });
      return;
    }
    const chatRoomId = params.data.chatRoomId;

    const rate = await markReadLimiter(`markread:${userId}`);
    setRateLimitHeaders(res, rate);
    if (!rate.allowed) {
      res.status(429).json({ ok: false, error: "Rate limit exceeded" });
      return;
    }

    const body = markReadSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        ok: false,
        error: body.error.issues[0]?.message ?? "Invalid input",
      });
      return;
    }

    await assertRoomAccess(userId, chatRoomId);

    const result = await markRoomRead(
      userId,
      chatRoomId,
      body.data.lastReadMessageId,
    );

    // Emit to all of the user's sessions so tabs/devices stay in sync.
    req.io.to(`user:${userId}`).emit("chatroom:read", {
      chatRoomId,
      unreadCount: result.unreadCount,
    });

    // Broadcast the read cursor to the room so senders' read ticks update.
    req.io.to(`room:${chatRoomId}`).emit("chatroom:readReceipt", {
      userId,
      chatRoomId,
      lastReadMessageId: result.lastReadMessageId,
      lastReadMessageCreatedAt: result.lastReadMessageCreatedAt,
    });

    res.json({ ok: true, ...result });
  }),
);

// GET /:chatRoomId/read-receipts
// Returns every member's read cursor so each participant can render
// per-message read ticks ("read by all") when the room is first opened.
router.get(
  "/:chatRoomId/read-receipts",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const params = chatRoomIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ ok: false, error: "chatRoomId missing" });
      return;
    }

    await assertRoomAccess(userId, params.data.chatRoomId);

    const receipts = await prisma.chatRoomReadReceipt.findMany({
      where: { chatRoomId: params.data.chatRoomId },
      select: {
        userId: true,
        lastReadMessageId: true,
        lastReadMessageCreatedAt: true,
      },
    });

    res.json({ ok: true, receipts });
  }),
);

export default router;
