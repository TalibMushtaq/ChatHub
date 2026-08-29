import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";
import { getLiveKitRoomClient } from "../../lib/livekit";
import { assertRoomAccess } from "../../middleware/socketAccess";
import { assertRoomPermission } from "./permissions";
import { createLogger } from "../../lib/logger";
import { TrackSource } from "livekit-server-sdk";
import {
  createOrReuseSession,
  upsertParticipant,
  markParticipantLeft,
  endSessionIfEmpty,
  generateCallToken,
} from "../call/core";
import {
  createCallHistoryMessage,
  emitCallHistoryMessage,
  type CallIO,
} from "../call/history";
import type { CallTarget } from "../../types/call";
import {
  DEFAULT_PARTICIPANT_LIMIT,
  getLiveKitRoomName,
} from "../../types/call";

const log = createLogger("call");

/**
 * Issue a LiveKit join token after verifying auth, membership, permissions,
 * and participant limits. Creates or reuses the active CallSession.
 */
export async function getJoinToken(
  userId: string,
  roomId: string,
  channelId: string,
): Promise<{
  token: string;
  livekitUrl: string;
  roomName: string;
  sessionId: string;
  isNewSession: boolean;
}> {
  // 1. Verify CONNECT_VOICE permission (also confirms room membership).
  await assertRoomPermission(userId, roomId, "CONNECT_VOICE");

  // 1a. Single-call constraint: reject if user is already in another active call.
  const existingParticipant = await prisma.callParticipant.findFirst({
    where: {
      userId,
      leftAt: null,
      session: { endedAt: null },
    },
    select: {
      id: true,
      session: { select: { channelId: true } },
    },
  });
  if (
    existingParticipant &&
    existingParticipant.session.channelId !== channelId
  ) {
    throw new ApiError(
      "You are already in another voice channel",
      409,
      "ALREADY_IN_CALL",
    );
  }

  // 2. Verify channel exists, belongs to room, and is a voice channel.
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, roomId },
    select: { id: true, type: true, participantLimit: true },
  });
  if (!channel) {
    throw new ApiError("Channel not found", 404, "CHANNEL_NOT_FOUND");
  }
  if (channel.type !== "VOICE") {
    throw new ApiError(
      "This channel is not a voice channel",
      400,
      "NOT_VOICE_CHANNEL",
    );
  }

  // 3. Enforce participant limit.
  const activeParticipants = await prisma.callParticipant.count({
    where: {
      session: { channelId, endedAt: null },
      leftAt: null,
    },
  });
  const limit = channel.participantLimit ?? DEFAULT_PARTICIPANT_LIMIT;
  if (activeParticipants >= limit) {
    throw new ApiError(
      `Voice channel is full (${limit} participants max)`,
      400,
      "CHANNEL_FULL",
    );
  }

  // 4. Create or reuse active CallSession for this channel.
  const target: CallTarget = { type: "channel", roomId, channelId };
  const { session, isNewSession } = await createOrReuseSession(
    target,
    "VOICE",
    "ACTIVE",
  );

  // 5. Upsert CallParticipant (handles re-join without leaving first).
  await upsertParticipant(session.id, userId);

  // 6. Generate short-lived LiveKit token.
  const { token, livekitUrl, roomName } = await generateCallToken(
    userId,
    target,
    session.id,
  );

  return { token, livekitUrl, roomName, sessionId: session.id, isNewSession };
}

/**
 * Mark a participant as having left the call. If the session has no more
 * active participants, end the session.
 *
 * Uses assertRoomAccess (membership check only) rather than assertRoomPermission
 * so that a user whose role was downgraded (losing CONNECT_VOICE) can still
 * leave the call cleanly via the API.
 */
export async function leaveCall(
  userId: string,
  roomId: string,
  channelId: string,
  io?: CallIO,
): Promise<{ sessionId: string; callEnded: boolean } | null> {
  // Membership check only — not CONNECT_VOICE — so demoted users can still leave.
  await assertRoomAccess(userId, roomId);

  const session = await prisma.callSession.findFirst({
    where: { channelId, endedAt: null },
    select: { id: true, callType: true, startedAt: true, endedAt: true },
  });
  if (!session) return null;

  const left = await markParticipantLeft(session.id, userId);
  if (!left) return null;

  const { callEnded } = await endSessionIfEmpty(session.id);

  if (callEnded) {
    // Record a call-history system message in the channel so members see the
    // call happened (endSessionIfEmpty sets outcome to COMPLETED).
    const message = await createCallHistoryMessage({
      sessionId: session.id,
      callType: session.callType,
      outcome: "COMPLETED",
      target: { type: "channel", roomId, channelId },
    });
    if (message) {
      emitCallHistoryMessage(
        io,
        { type: "channel", roomId, channelId },
        message,
      );
    }
    // LiveKit room deletion is deliberately NOT done here: the route deletes
    // the room AFTER emitting call.ended so remaining peers can disconnect
    // gracefully instead of being force-closed by the SFU.
  }

  return { sessionId: session.id, callEnded };
}

/**
 * Force-leave a user from any active call they are in. Called by kick/ban
 * services when membership is removed. No permission check — the caller
 * (admin action) has already been verified.
 *
 * Returns the channelId if the user was in a call, so the caller can emit
 * the appropriate socket event.
 */
export async function forceLeaveCall(userId: string): Promise<{
  channelId: string;
  sessionId: string;
  callEnded: boolean;
} | null> {
  const participant = await prisma.callParticipant.findFirst({
    where: {
      userId,
      leftAt: null,
      session: { endedAt: null },
    },
    include: {
      session: {
        select: { id: true, channelId: true, callType: true },
      },
    },
  });

  if (!participant) return null;

  await prisma.callParticipant.update({
    where: { id: participant.id },
    data: { leftAt: new Date() },
  });

  // Remove from LiveKit room if possible.
  try {
    const roomClient = getLiveKitRoomClient();
    const roomName = getLiveKitRoomName(
      {
        type: "channel",
        roomId: "",
        channelId: participant.session.channelId!,
      },
      participant.session.id,
    );
    await roomClient.removeParticipant(roomName, `user:${userId}`);
  } catch {
    // LiveKit room may already be gone — non-fatal.
  }

  const { callEnded } = await endSessionIfEmpty(participant.session.id);

  if (callEnded) {
    // Record the call in the channel history. The kicked member may not have
    // io here, so the message persists and appears on the next timeline fetch.
    const channel = await prisma.channel.findUnique({
      where: { id: participant.session.channelId! },
      select: { roomId: true },
    });
    if (channel) {
      await createCallHistoryMessage({
        sessionId: participant.session.id,
        callType: participant.session.callType,
        outcome: "COMPLETED",
        target: {
          type: "channel",
          roomId: channel.roomId,
          channelId: participant.session.channelId!,
        },
      });
    }

    try {
      const roomClient = getLiveKitRoomClient();
      await roomClient.deleteRoom(
        getLiveKitRoomName(
          {
            type: "channel",
            roomId: "",
            channelId: participant.session.channelId!,
          },
          participant.session.id,
        ),
      );
    } catch {
      // Room may already be gone — non-fatal.
    }
  }

  log.info("Force-left user from call", {
    userId,
    channelId: participant.session.channelId,
    callEnded,
  });

  return {
    channelId: participant.session.channelId!,
    sessionId: participant.session.id,
    callEnded,
  };
}

/**
 * Return the active call session and its current participants for a channel.
 */
export async function getActiveCall(channelId: string) {
  const session = await prisma.callSession.findFirst({
    where: { channelId, endedAt: null },
    include: {
      participants: {
        where: { leftAt: null },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true,
            },
          },
        },
      },
    },
  });

  return session ?? null;
}

/**
 * Return all active call sessions (with participants) for a room.
 * Used by the sidebar to show live activity across every voice channel.
 */
export async function getActiveCallsForRoom(roomId: string) {
  const sessions = await prisma.callSession.findMany({
    where: { endedAt: null, Channel: { roomId } },
    include: {
      participants: {
        where: { leftAt: null },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true,
            },
          },
        },
      },
    },
  });
  return sessions.map((s) => ({
    channelId: s.channelId,
    sessionId: s.id,
    participants: s.participants.map((p) => ({
      userId: p.user.id,
      username: p.user.username,
      displayName: p.user.displayName,
      avatar: p.user.avatar,
    })),
  }));
}

/**
 * Moderator action: server-mute or disconnect a participant.
 * Verifies MOVE_MEMBERS_VOICE and uses LiveKit server API for enforcement.
 */
export async function moderatorAction(
  moderatorId: string,
  roomId: string,
  channelId: string,
  targetUserId: string,
  action: "mute" | "disconnect",
): Promise<void> {
  await assertRoomPermission(moderatorId, roomId, "MOVE_MEMBERS_VOICE");

  const session = await prisma.callSession.findFirst({
    where: { channelId, endedAt: null },
  });
  if (!session) {
    throw new ApiError("No active call in this channel", 404, "NO_ACTIVE_CALL");
  }

  const participant = await prisma.callParticipant.findUnique({
    where: {
      sessionId_userId: { sessionId: session.id, userId: targetUserId },
    },
  });
  if (!participant || participant.leftAt) {
    throw new ApiError(
      "User is not in this call",
      404,
      "PARTICIPANT_NOT_FOUND",
    );
  }

  const roomClient = getLiveKitRoomClient();
  const roomName = getLiveKitRoomName(
    { type: "channel", roomId, channelId },
    session.id,
  );
  const identity = `user:${targetUserId}`;

  if (action === "disconnect") {
    await roomClient.removeParticipant(roomName, identity);
    // Mark as left in DB.
    await prisma.callParticipant.update({
      where: { id: participant.id },
      data: { leftAt: new Date() },
    });
    log.info("Moderator disconnected participant", {
      moderatorId,
      targetUserId,
      channelId,
    });
  } else if (action === "mute") {
    // Server-mute: find the participant's audio tracks and mute them via LiveKit API.
    const lkParticipant = await roomClient.getParticipant(roomName, identity);
    if (lkParticipant) {
      for (const track of lkParticipant.tracks) {
        if (track.source === TrackSource.MICROPHONE && !track.muted) {
          await roomClient.mutePublishedTrack(
            roomName,
            identity,
            track.sid,
            true,
          );
        }
      }
    }
    log.info("Moderator server-muted participant", {
      moderatorId,
      targetUserId,
      channelId,
    });
  }
}

// Re-export from shared core so callers can import from one place.
export {
  reapStaleParticipants,
  endAllActiveSessions,
  timeoutRingingCalls,
} from "../call/core";
