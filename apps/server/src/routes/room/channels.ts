import { Router } from "express";
import requireAuth from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/async-handler";
import {
  roomIdParamSchema,
  channelIdParamSchema,
  createChannelSchema,
  updateChannelSchema,
  channelReorderSchema,
} from "@repo/validators";
import {
  listChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  reorderChannels,
} from "../../services/room/channels";
import { assertRoomAccess } from "../../middleware/socketAccess";

const router = Router();

// GET /rooms/:roomId/channels
router.get(
  "/rooms/:roomId/channels",
  requireAuth,
  asyncHandler(async (req, res) => {
    const roomId = roomIdParamSchema.parse(req.params).roomId;
    await assertRoomAccess(req.user!.id, roomId);
    const channels = await listChannels(roomId);
    res.json({ ok: true, channels });
  }),
);

// POST /rooms/:roomId/channels
router.post(
  "/rooms/:roomId/channels",
  requireAuth,
  asyncHandler(async (req, res) => {
    const roomId = roomIdParamSchema.parse(req.params).roomId;
    const input = createChannelSchema.parse(req.body);
    const channel = await createChannel(req.user!.id, roomId, input);
    req.io.to(`room:${roomId}`).emit("channel:created", { roomId, channel });
    res.status(201).json({ ok: true, channel });
  }),
);

// PATCH /rooms/:roomId/channels/reorder
// Must be registered before :channelId to avoid the param route capturing "reorder".
router.patch(
  "/rooms/:roomId/channels/reorder",
  requireAuth,
  asyncHandler(async (req, res) => {
    const roomId = roomIdParamSchema.parse(req.params).roomId;
    const { items } = channelReorderSchema.parse(req.body);
    await reorderChannels(req.user!.id, roomId, items);
    req.io.to(`room:${roomId}`).emit("channel:reordered", { roomId, items });
    res.json({ ok: true });
  }),
);

// PATCH /rooms/:roomId/channels/:channelId
router.patch(
  "/rooms/:roomId/channels/:channelId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roomId, channelId } = {
      ...roomIdParamSchema.parse(req.params),
      ...channelIdParamSchema.parse(req.params),
    };
    const input = updateChannelSchema.parse(req.body);
    const channel = await updateChannel(req.user!.id, roomId, channelId, input);
    req.io.to(`room:${roomId}`).emit("channel:updated", { roomId, channel });
    res.json({ ok: true, channel });
  }),
);

// DELETE /rooms/:roomId/channels/:channelId
router.delete(
  "/rooms/:roomId/channels/:channelId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roomId, channelId } = {
      ...roomIdParamSchema.parse(req.params),
      ...channelIdParamSchema.parse(req.params),
    };
    await deleteChannel(req.user!.id, roomId, channelId);
    req.io.to(`room:${roomId}`).emit("channel:deleted", { roomId, channelId });
    res.json({ ok: true });
  }),
);

export default router;
