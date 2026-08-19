import { Router, Request, Response, NextFunction } from "express";
import requireAuth from "../../middleware/requireAuth";
import { prisma } from "../../../db/prisma";
import {
  createRoomSchema,
  roomIdParamSchema,
  channelIdParamSchema,
  markReadSchema,
  getMessagesSchema,
  updateRoomSchema,
} from "@repo/validators";
import { assertRoomAccess } from "../../middleware/socketAccess";
import { asyncHandler } from "../../middleware/async-handler";
import { markRoomRead } from "../../services/room/markRead";
import { getMessages } from "../../services/room/getMessages";
import { getMembers } from "../../services/room/getMembers";
import {
  updateRoom,
  deleteRoom,
  seedDefaultStructure,
} from "../../services/room/roomSettings";
import { getRoomStructure } from "../../services/room/channels";
import { leaveRoom } from "../../services/room/leaveRoom";
import { createRateLimiter, setRateLimitHeaders } from "../../lib/rateLimiter";
import joinRoomInvite from "./joinroominvite";
import joinRoomRequest from "./joinroomreq";
import joinRoomlink from "./joinroomlink";
import updateRoomAvatarRouter from "./updateRoomAvatar";
import categoriesRouter from "./categories";
import channelsRouter from "./channels";
import membersRouter from "./members";

const router = Router();

// join room routes
router.use(joinRoomInvite);
router.use(joinRoomRequest);
router.use(joinRoomlink);
router.use(updateRoomAvatarRouter);

// Category + channel management (spec §5.5)
router.use(categoriesRouter);
router.use(channelsRouter);

// Member + role management (Phase 4 §8)
router.use(membersRouter);

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

      // Every Room starts with GENERAL → #general so messages always have a
      // channel to land in (mirrors the migration backfill for existing rooms).
      await seedDefaultStructure(room.id);

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
              // Only the duration is needed so list previews can render a voice
              // message as "🎤 Voice message (0:12)" without a second query.
              attachments: { select: { duration: true } },
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

// GET /:roomId/messages
// Returns the room's message timeline with cursor pagination (same contract as
// the direct-chat GET /:directChatId/messages so the web client can reuse its
// timeline hook). Access is gated by room membership. An optional `channelId`
// query scopes results to one channel; the nested
// GET /:roomId/channels/:channelId/messages route is the preferred form.
router.get(
  "/:roomId/messages",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const params = roomIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ ok: false, error: "roomId missing" });
      return;
    }
    const roomId = params.data.roomId;

    await assertRoomAccess(userId, roomId);

    const query = getMessagesSchema.safeParse(req.query);
    const { cursor, limit, direction } = query.success ? query.data : {};
    const channelId =
      typeof req.query.channelId === "string" ? req.query.channelId : undefined;

    const { messages, nextCursor } = await getMessages(roomId, {
      cursor,
      limit,
      direction,
      channelId,
    });
    res.json({ ok: true, messages, nextCursor });
  }),
);

// GET /:roomId/channels/:channelId/messages
// Channel-scoped timeline — the canonical way to load a channel's history
// (spec §5.5: messages scoped to roomId + channelId).
router.get(
  "/:roomId/channels/:channelId/messages",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const roomId = roomIdParamSchema.safeParse(req.params).data?.roomId;
    const channelId = channelIdParamSchema.safeParse(req.params).data
      ?.channelId;
    if (!roomId || !channelId) {
      res
        .status(400)
        .json({ ok: false, error: "roomId and channelId required" });
      return;
    }

    await assertRoomAccess(userId, roomId);

    const query = getMessagesSchema.safeParse(req.query);
    const { cursor, limit, direction } = query.success ? query.data : {};

    const { messages, nextCursor } = await getMessages(roomId, {
      cursor,
      limit,
      direction,
      channelId,
    });
    res.json({ ok: true, messages, nextCursor });
  }),
);

// GET /:roomId/members
// Lists the room's members (user info + role) for the room info panel.
// Access is gated by room membership.
router.get(
  "/:roomId/members",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const params = roomIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ ok: false, error: "roomId missing" });
      return;
    }
    const roomId = params.data.roomId;

    await assertRoomAccess(userId, roomId);

    const members = await getMembers(roomId);
    res.json({ ok: true, members });
  }),
);

// GET /rooms/:roomId
// Room detail including the full category → channel structure for the sidebar.
// Access is gated by room membership.
router.get(
  "/rooms/:roomId",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const params = roomIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ ok: false, error: "roomId missing" });
      return;
    }
    const roomId = params.data.roomId;

    await assertRoomAccess(userId, roomId);

    const room = await getRoomStructure(roomId);
    res.json({ ok: true, room });
  }),
);

// PATCH /rooms/:roomId
// Update the room profile (owner only). Separated from GET /:roomId to avoid
// clashing with the sub-routes that mount under /:roomId/... (messages, members).
router.patch(
  "/rooms/:roomId",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const params = roomIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ ok: false, error: "roomId missing" });
      return;
    }
    const roomId = params.data.roomId;

    const input = updateRoomSchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({
        ok: false,
        error: input.error.issues[0]?.message ?? "Invalid input",
      });
      return;
    }

    const room = await updateRoom(userId, roomId, input.data);
    res.json({ ok: true, room });
  }),
);

// DELETE /rooms/:roomId
// Owner-only; cascades categories, channels, messages, memberships, invites.
// Backend-only in Phase 1 — the Settings "Danger Zone" UI lands in Phase 5.
router.delete(
  "/rooms/:roomId",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const params = roomIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ ok: false, error: "roomId missing" });
      return;
    }
    const roomId = params.data.roomId;

    await deleteRoom(userId, roomId);
    res.json({ ok: true });
  }),
);

// POST /rooms/:roomId/leave
// Removes the caller's own membership (Phase 2 §6.1). Owners are rejected so a
// room never gets orphaned; ownership transfer lives in the Phase 5 settings.
router.post(
  "/rooms/:roomId/leave",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const params = roomIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ ok: false, error: "roomId missing" });
      return;
    }
    const roomId = params.data.roomId;

    await leaveRoom(userId, roomId);
    // The leaver's other tabs need to drop the room from their list too.
    req.io.to(`user:${userId}`).emit("chatroom:left", { roomId });
    // Everyone else in the room sees the member removed from the sidebar.
    req.io.to(`room:${roomId}`).emit("chatroom:member:removed", {
      roomId,
      userId,
      reason: "left",
    });
    res.json({ ok: true });
  }),
);

const markReadLimiter = createRateLimiter({
  maxAttempts: 120,
  windowMs: 60_000,
  prefix: "room:markread",
});

// POST /:roomId/mark-read
// Uses asyncHandler so ApiError statuses (403 FORBIDDEN, 404 MESSAGE_NOT_FOUND,
// 400 MESSAGE_WRONG_ROOM) reach the shared error handler instead of being
// flattened into a 500 by a local try/catch.
router.post(
  "/:roomId/mark-read",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const params = roomIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ ok: false, error: "roomId missing" });
      return;
    }
    const roomId = params.data.roomId;

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

    await assertRoomAccess(userId, roomId);

    const result = await markRoomRead(
      userId,
      roomId,
      body.data.lastReadMessageId,
    );

    // Emit to all of the user's sessions so tabs/devices stay in sync.
    req.io.to(`user:${userId}`).emit("chatroom:read", {
      roomId,
      unreadCount: result.unreadCount,
    });

    // Broadcast the read cursor to the room so senders' read ticks update.
    req.io.to(`room:${roomId}`).emit("chatroom:readReceipt", {
      userId,
      roomId,
      lastReadMessageId: result.lastReadMessageId,
      lastReadMessageCreatedAt: result.lastReadMessageCreatedAt,
    });

    res.json({ ok: true, ...result });
  }),
);

// GET /:roomId/read-receipts
// Returns every member's read cursor so each participant can render
// per-message read ticks ("read by all") when the room is first opened.
router.get(
  "/:roomId/read-receipts",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const params = roomIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ ok: false, error: "roomId missing" });
      return;
    }

    await assertRoomAccess(userId, params.data.roomId);

    const receipts = await prisma.chatRoomReadReceipt.findMany({
      where: { chatRoomId: params.data.roomId },
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
