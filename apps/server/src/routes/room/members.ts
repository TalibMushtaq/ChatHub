import { Router } from "express";
import type { Request, Response } from "express";
import requireAuth from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/async-handler";
import {
  roomIdParamSchema,
  memberUserIdParamSchema,
  changeMemberRoleSchema,
  banMemberSchema,
  muteMemberSchema,
  setNicknameSchema,
} from "@repo/validators";
import type { z } from "zod";
import { assertRoomAccess } from "../../middleware/socketAccess";
import {
  changeMemberRole,
  kickMember,
  banMember,
  unbanMember,
  getRoomBans,
  muteMember,
  unmuteMember,
  setNickname,
} from "../../services/room/members";
import type { Server as IOServer } from "socket.io";

const router = Router();

/** Parse `:roomId` + `:userId` from params (validated). */
function parseParams(params: unknown) {
  const roomId = roomIdParamSchema.parse(params).roomId;
  const userId = memberUserIdParamSchema.parse(params).userId;
  return { roomId, userId };
}

/** Validate `req.body` against a schema, responding 400 on invalid input. */
function parseBody<S extends z.ZodTypeAny>(
  schema: S,
  req: Request,
  res: Response,
) {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    });
    return null;
  }
  return parsed.data as z.infer<S>;
}

// PATCH /rooms/:roomId/members/:userId/role
// Assign/change a member's role (owner-only via MANAGE_ROLES).
router.patch(
  "/:roomId/members/:userId/role",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roomId, userId } = parseParams(req.params);
    const body = parseBody(changeMemberRoleSchema, req, res);
    if (!body) return;
    const member = await changeMemberRole(
      req.user!.id,
      roomId,
      userId,
      body.role,
    );
    // Notify the whole room (sidebar role chips) and the affected user.
    req.io.to(`room:${roomId}`).emit("chatroom:member:roleChanged", {
      roomId,
      userId,
      role: body.role,
      member,
    });
    res.json({ ok: true, member });
  }),
);

// POST /rooms/:roomId/members/:userId/kick
router.post(
  "/:roomId/members/:userId/kick",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roomId, userId } = parseParams(req.params);
    const result = await kickMember(req.user!.id, roomId, userId);
    emitMemberRemoved(req.io, roomId, userId, "kicked");
    res.json({ ok: true, ...result });
  }),
);

// POST /rooms/:roomId/members/:userId/ban
router.post(
  "/:roomId/members/:userId/ban",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roomId, userId } = parseParams(req.params);
    const body = parseBody(banMemberSchema, req, res);
    if (!body) return;
    const result = await banMember(req.user!.id, roomId, userId, body.reason);
    emitMemberRemoved(req.io, roomId, userId, "banned");
    res.json({ ok: true, ...result });
  }),
);

// DELETE /rooms/:roomId/members/:userId/ban
router.delete(
  "/:roomId/members/:userId/ban",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roomId, userId } = parseParams(req.params);
    const result = await unbanMember(req.user!.id, roomId, userId);
    res.json({ ok: true, ...result });
  }),
);

// GET /rooms/:roomId/bans
router.get(
  "/:roomId/bans",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roomId } = roomIdParamSchema.parse(req.params);
    await assertRoomAccess(req.user!.id, roomId);
    const bans = await getRoomBans(roomId);
    res.json({ ok: true, bans });
  }),
);

// POST /rooms/:roomId/members/:userId/mute
router.post(
  "/:roomId/members/:userId/mute",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roomId, userId } = parseParams(req.params);
    const body = parseBody(muteMemberSchema, req, res);
    if (!body) return;
    const member = await muteMember(
      req.user!.id,
      roomId,
      userId,
      body.durationMinutes,
    );
    req.io.to(`room:${roomId}`).emit("chatroom:member:muted", {
      roomId,
      userId,
      mutedUntil: member.mutedUntil,
    });
    res.json({ ok: true, member });
  }),
);

// DELETE /rooms/:roomId/members/:userId/mute
router.delete(
  "/:roomId/members/:userId/mute",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roomId, userId } = parseParams(req.params);
    const member = await unmuteMember(req.user!.id, roomId, userId);
    req.io.to(`room:${roomId}`).emit("chatroom:member:unmuted", {
      roomId,
      userId,
    });
    res.json({ ok: true, member });
  }),
);

// PATCH /rooms/:roomId/members/:userId/nickname
router.patch(
  "/:roomId/members/:userId/nickname",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roomId, userId } = parseParams(req.params);
    const body = parseBody(setNicknameSchema, req, res);
    if (!body) return;
    const member = await setNickname(
      req.user!.id,
      roomId,
      userId,
      body.nickname,
    );
    req.io.to(`room:${roomId}`).emit("chatroom:member:nicknameChanged", {
      roomId,
      userId,
      nickname: member.nickname,
    });
    res.json({ ok: true, member });
  }),
);

/**
 * Broadcast that a member was removed (kicked/banned) to everyone in the room.
 * The removed user's own sockets get a targeted event so they know immediately.
 */
function emitMemberRemoved(
  io: IOServer,
  roomId: string,
  userId: string,
  reason: "kicked" | "banned",
) {
  io.to(`room:${roomId}`).emit("chatroom:member:removed", {
    roomId,
    userId,
    reason,
  });
}

export default router;
