import { Router } from "express";
import requireAuth from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/async-handler";
import { roomIdParamSchema, channelIdParamSchema } from "@repo/validators";
import {
  getJoinToken,
  leaveCall,
  getActiveCall,
  getActiveCallsForRoom,
  moderatorAction,
} from "../../services/room/call";
import { assertRoomAccess } from "../../middleware/socketAccess";
import { getLiveKitRoomClient } from "../../lib/livekit";
import { getLiveKitRoomName } from "../../types/call";
import { createLogger } from "../../lib/logger";

const log = createLogger("room-call-route");

const router = Router();

// POST /rooms/:roomId/channels/:channelId/call/join-token
// Returns a LiveKit join token after verifying permissions and participant limits.
router.post(
  "/rooms/:roomId/channels/:channelId/call/join-token",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roomId, channelId } = {
      ...roomIdParamSchema.parse(req.params),
      ...channelIdParamSchema.parse(req.params),
    };
    await assertRoomAccess(req.user!.id, roomId);
    const result = await getJoinToken(req.user!.id, roomId, channelId);

    // Broadcast call.started to the room when the first participant joins.
    if (result.isNewSession) {
      req.io.to(`room:${roomId}`).emit("call.started", {
        channelId,
        sessionId: result.sessionId,
      });
    }

    res.json({ ok: true, ...result });
  }),
);

// POST /rooms/:roomId/channels/:channelId/call/leave
// Marks the participant as having left; ends the session if last participant.
router.post(
  "/rooms/:roomId/channels/:channelId/call/leave",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roomId, channelId } = {
      ...roomIdParamSchema.parse(req.params),
      ...channelIdParamSchema.parse(req.params),
    };
    await assertRoomAccess(req.user!.id, roomId);
    const leaveResult = await leaveCall(
      req.user!.id,
      roomId,
      channelId,
      req.io,
    );

    if (leaveResult) {
      // Broadcast leave to everyone in the room.
      req.io.to(`room:${roomId}`).emit("call.participant.left", {
        channelId,
        userId: req.user!.id,
      });

      // If the session ended (last participant left), broadcast call.ended.
      if (leaveResult.callEnded) {
        req.io.to(`room:${roomId}`).emit("call.ended", {
          channelId,
          sessionId: leaveResult.sessionId,
        });

        // Delete the LiveKit room only AFTER clients were told the call ended,
        // so remaining peers disconnect gracefully instead of being
        // force-closed by the SFU.
        try {
          const roomClient = getLiveKitRoomClient();
          await roomClient.deleteRoom(
            getLiveKitRoomName(
              { type: "channel", roomId, channelId },
              leaveResult.sessionId,
            ),
          );
        } catch (err) {
          log.warn("Failed to delete LiveKit room after call ended", {
            error: String(err),
          });
        }
      }
    }

    res.json({ ok: true });
  }),
);

// GET /rooms/:roomId/channels/:channelId/call
// Returns the active call session and its current participants.
router.get(
  "/rooms/:roomId/channels/:channelId/call",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roomId, channelId } = {
      ...roomIdParamSchema.parse(req.params),
      ...channelIdParamSchema.parse(req.params),
    };
    await assertRoomAccess(req.user!.id, roomId);
    const session = await getActiveCall(channelId);
    res.json({ ok: true, session });
  }),
);

// GET /rooms/:roomId/calls/active
// Returns all active calls across every channel in the room (sidebar presence).
router.get(
  "/rooms/:roomId/calls/active",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roomId } = roomIdParamSchema.parse(req.params);
    await assertRoomAccess(req.user!.id, roomId);
    const calls = await getActiveCallsForRoom(roomId);
    res.json({ ok: true, calls });
  }),
);

// PATCH /rooms/:roomId/channels/:channelId/call/participants/:userId
// Moderator actions: server-mute or disconnect a participant.
router.patch(
  "/rooms/:roomId/channels/:channelId/call/participants/:userId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roomId, channelId } = {
      ...roomIdParamSchema.parse(req.params),
      ...channelIdParamSchema.parse(req.params),
    };
    const targetUserId = String(req.params.userId ?? "");
    const { action } = req.body as { action?: string };

    if (action !== "mute" && action !== "disconnect") {
      res.status(400).json({
        ok: false,
        error: "action must be 'mute' or 'disconnect'",
      });
      return;
    }

    await assertRoomAccess(req.user!.id, roomId);
    await moderatorAction(
      req.user!.id,
      roomId,
      channelId,
      targetUserId,
      action,
    );

    if (action === "disconnect") {
      req.io.to(`room:${roomId}`).emit("call.participant.kicked", {
        channelId,
        userId: targetUserId,
        by: req.user!.id,
      });
    } else {
      req.io.to(`room:${roomId}`).emit("call.participant.muted", {
        channelId,
        userId: targetUserId,
        by: req.user!.id,
      });
    }

    res.json({ ok: true });
  }),
);

export default router;
