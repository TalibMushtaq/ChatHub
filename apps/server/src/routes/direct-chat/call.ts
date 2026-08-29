import { Router } from "express";
import requireAuth from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/async-handler";
import {
  directChatIdParamSchema,
  dmCallInitiateSchema,
} from "@repo/validators";
import {
  initiateDmCall,
  acceptDmCall,
  declineDmCall,
  cancelDmCall,
  joinDmCall,
  leaveDmCall,
  getActiveDmCall,
} from "../../services/direct-chat/call";
import { assertDirectChatAccess } from "../../middleware/socketAccess";
import { createRateLimiter, enforceRateLimit } from "../../lib/rateLimiter";
import { unwrapParsed } from "../../lib/validate";
import { getDirectChatRoom } from "../../sockets/direct-chat";
import { getLiveKitRoomClient } from "../../lib/livekit";
import { getLiveKitRoomName } from "../../types/call";
import { createLogger } from "../../lib/logger";
import { prisma } from "../../../db/prisma";

const log = createLogger("dm-call-route");

const callLimiter = createRateLimiter({
  maxAttempts: 30,
  windowMs: 60_000,
  prefix: "dm:call",
});

/**
 * Fetch the other participant's userId from a directChat.
 * Returns null if the chat doesn't exist or the user isn't a participant.
 */
async function getCalleeId(
  directChatId: string,
  callerId: string,
): Promise<string | null> {
  const dc = await prisma.directChat.findUnique({
    where: { id: directChatId },
    select: { user1Id: true, user2Id: true },
  });
  if (!dc) return null;
  return dc.user1Id === callerId ? dc.user2Id : dc.user1Id;
}

const router = Router();

// POST /:directChatId/call/initiate
// Start a new DM call. Returns a LiveKit token so the caller connects immediately.
router.post(
  "/:directChatId/call/initiate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const { directChatId } = unwrapParsed(
      directChatIdParamSchema.safeParse(req.params),
      { message: "directChatId missing" },
    );

    await enforceRateLimit(res, callLimiter, `call:${userId}`);

    await assertDirectChatAccess(userId, directChatId);

    const { callType } = unwrapParsed(
      dmCallInitiateSchema.safeParse(req.body),
      { message: "callType must be 'VOICE' or 'VIDEO'" },
    );

    const result = await initiateDmCall(userId, directChatId, callType);

    // Emit invite to the callee only (not the caller's room).
    const calleeId = await getCalleeId(directChatId, userId);
    if (calleeId) {
      req.io.to(`user:${calleeId}`).emit("dmCall:invited", {
        directChatId,
        sessionId: result.sessionId,
        callType,
        caller: {
          id: userId,
          username: req.user.username,
          displayName: req.user.displayName,
          avatar: req.user.avatar,
        },
      });
    }

    res.status(201).json({ ok: true, ...result });
  }),
);

// POST /:directChatId/call/accept
// Accept an incoming DM call. Does NOT change session status — that happens
// when both participants connect to LiveKit (see socket livekitConnected).
router.post(
  "/:directChatId/call/accept",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const { directChatId } = unwrapParsed(
      directChatIdParamSchema.safeParse(req.params),
      { message: "directChatId missing" },
    );

    await enforceRateLimit(res, callLimiter, `call:${userId}`);

    await assertDirectChatAccess(userId, directChatId);

    const result = await acceptDmCall(userId, directChatId);

    // Notify all participants that the call was accepted.
    const room = getDirectChatRoom(directChatId);
    req.io.to(room).emit("dmCall:accepted", {
      directChatId,
      sessionId: result.sessionId,
    });

    // Multi-device sync: dismiss callee's incoming call UI on other devices.
    req.io.to(`user:${userId}`).emit("dmCall:dismiss", {
      directChatId,
      sessionId: result.sessionId,
      reason: "accepted",
    });

    res.json({ ok: true, ...result });
  }),
);

// POST /:directChatId/call/decline
// Decline an incoming DM call. Ends the session and creates a system message.
router.post(
  "/:directChatId/call/decline",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const { directChatId } = unwrapParsed(
      directChatIdParamSchema.safeParse(req.params),
      { message: "directChatId missing" },
    );

    await enforceRateLimit(res, callLimiter, `call:${userId}`);

    await assertDirectChatAccess(userId, directChatId);

    const result = await declineDmCall(userId, directChatId, req.io);

    // Notify all participants that the call was declined.
    const room = getDirectChatRoom(directChatId);
    req.io.to(room).emit("dmCall:declined", {
      directChatId,
      sessionId: result.sessionId,
    });

    // Multi-device sync: dismiss all devices on both sides.
    const otherUserId = await getCalleeId(directChatId, userId);
    req.io.to(`user:${userId}`).emit("dmCall:dismiss", {
      directChatId,
      sessionId: result.sessionId,
      reason: "declined",
    });
    if (otherUserId) {
      req.io.to(`user:${otherUserId}`).emit("dmCall:dismiss", {
        directChatId,
        sessionId: result.sessionId,
        reason: "declined",
      });
    }

    res.json({ ok: true, ...result });
  }),
);

// POST /:directChatId/call/cancel
// Cancel a DM call (caller-initiated). Ends the session and creates a system message.
router.post(
  "/:directChatId/call/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const { directChatId } = unwrapParsed(
      directChatIdParamSchema.safeParse(req.params),
      { message: "directChatId missing" },
    );

    await enforceRateLimit(res, callLimiter, `call:${userId}`);

    await assertDirectChatAccess(userId, directChatId);

    const result = await cancelDmCall(userId, directChatId, req.io);

    // Notify all participants that the call was cancelled.
    const room = getDirectChatRoom(directChatId);
    req.io.to(room).emit("dmCall:cancelled", {
      directChatId,
      sessionId: result.sessionId,
    });

    // Multi-device sync: dismiss all devices on both sides.
    const otherUserId = await getCalleeId(directChatId, userId);
    req.io.to(`user:${userId}`).emit("dmCall:dismiss", {
      directChatId,
      sessionId: result.sessionId,
      reason: "cancelled",
    });
    if (otherUserId) {
      req.io.to(`user:${otherUserId}`).emit("dmCall:dismiss", {
        directChatId,
        sessionId: result.sessionId,
        reason: "cancelled",
      });
    }

    res.json({ ok: true, ...result });
  }),
);

// POST /:directChatId/call/join
// Join an active DM call. Upserts the participant and returns a LiveKit token.
router.post(
  "/:directChatId/call/join",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const { directChatId } = unwrapParsed(
      directChatIdParamSchema.safeParse(req.params),
      { message: "directChatId missing" },
    );

    await enforceRateLimit(res, callLimiter, `call:${userId}`);

    await assertDirectChatAccess(userId, directChatId);

    const result = await joinDmCall(userId, directChatId);

    // Broadcast participant joined to the DM room.
    const room = getDirectChatRoom(directChatId);
    req.io.to(room).emit("dmCall:participant.joined", {
      directChatId,
      sessionId: result.sessionId,
      userId,
      user: {
        id: userId,
        username: req.user.username,
        displayName: req.user.displayName,
        avatar: req.user.avatar,
      },
    });

    res.json({ ok: true, ...result });
  }),
);

// POST /:directChatId/call/leave
// Leave a DM call. Marks participant as left; ends session if last participant.
router.post(
  "/:directChatId/call/leave",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const { directChatId } = unwrapParsed(
      directChatIdParamSchema.safeParse(req.params),
      { message: "directChatId missing" },
    );

    await assertDirectChatAccess(userId, directChatId);

    const leaveResult = await leaveDmCall(userId, directChatId, req.io);

    if (leaveResult) {
      const room = getDirectChatRoom(directChatId);

      req.io.to(room).emit("dmCall:participant.left", {
        directChatId,
        sessionId: leaveResult.sessionId,
        userId,
      });

      if (leaveResult.callEnded) {
        req.io.to(room).emit("dmCall:ended", {
          directChatId,
          sessionId: leaveResult.sessionId,
          outcome: leaveResult.outcome ?? "COMPLETED",
        });

        // Delete the LiveKit room only AFTER clients were told the call ended,
        // so the remaining peer disconnects gracefully rather than having its
        // peer connection force-closed by the SFU.
        try {
          const roomClient = getLiveKitRoomClient();
          await roomClient.deleteRoom(
            getLiveKitRoomName(
              { type: "direct", directChatId },
              leaveResult.sessionId,
            ),
          );
        } catch (err) {
          log.warn("Failed to delete LiveKit room after DM call ended", {
            error: String(err),
          });
        }
      }
    }

    res.json({ ok: true });
  }),
);

// GET /:directChatId/call
// Returns the active DM call session and its current participants.
router.get(
  "/:directChatId/call",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const { directChatId } = unwrapParsed(
      directChatIdParamSchema.safeParse(req.params),
      { message: "directChatId missing" },
    );

    await assertDirectChatAccess(userId, directChatId);

    const session = await getActiveDmCall(directChatId);
    res.json({ ok: true, session });
  }),
);

export default router;
