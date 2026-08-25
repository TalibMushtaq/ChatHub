import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";
import {
  generateJoinToken,
  getLiveKitRoomClient,
  LIVEKIT_WS_URL,
} from "../../lib/livekit";
import { assertRoomAccess } from "../../middleware/socketAccess";
import { assertRoomPermission } from "./permissions";
import { createLogger } from "../../lib/logger";
import { TrackSource } from "livekit-server-sdk";

const log = createLogger("call");

// LiveKit room name convention: one call per voice channel.
function liveKitRoomName(channelId: string): string {
  return `channel:${channelId}`;
}

const DEFAULT_PARTICIPANT_LIMIT = 25;

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
  let session = await prisma.callSession.findFirst({
    where: { channelId, endedAt: null },
  });
  // Track whether this is the first participant (used by the route to emit call.started).
  const isNewSession = !session;
  if (!session) {
    session = await prisma.callSession.create({
      data: { channelId },
    });
    log.info("Created new call session", {
      sessionId: session.id,
      channelId,
    });
  }

  // 5. Upsert CallParticipant (handles re-join without leaving first).
  await prisma.callParticipant.upsert({
    where: { sessionId_userId: { sessionId: session.id, userId } },
    create: { sessionId: session.id, userId },
    update: { leftAt: null, joinedAt: new Date() },
  });

  // 6. Generate short-lived LiveKit token.
  const roomName = liveKitRoomName(channelId);
  const token = await generateJoinToken(userId, roomName);

  return {
    token,
    livekitUrl: LIVEKIT_WS_URL,
    roomName,
    sessionId: session.id,
    isNewSession,
  };
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
): Promise<{ sessionId: string; callEnded: boolean } | null> {
  // Membership check only — not CONNECT_VOICE — so demoted users can still leave.
  await assertRoomAccess(userId, roomId);

  const session = await prisma.callSession.findFirst({
    where: { channelId, endedAt: null },
  });
  if (!session) return null; // No active call — nothing to leave.

  const participant = await prisma.callParticipant.findUnique({
    where: { sessionId_userId: { sessionId: session.id, userId } },
  });
  if (!participant || participant.leftAt) return null; // Already left.

  await prisma.callParticipant.update({
    where: { id: participant.id },
    data: { leftAt: new Date() },
  });

  // Check if anyone is still in the call.
  const remaining = await prisma.callParticipant.count({
    where: { sessionId: session.id, leftAt: null },
  });

  if (remaining === 0) {
    await prisma.callSession.update({
      where: { id: session.id },
      data: { endedAt: new Date() },
    });
    log.info("Call session ended (no participants)", { sessionId: session.id });

    // Clean up the LiveKit room.
    try {
      const roomClient = getLiveKitRoomClient();
      await roomClient.deleteRoom(liveKitRoomName(channelId));
    } catch (err) {
      // Room may already be gone — non-fatal.
      log.warn("Failed to delete LiveKit room", { error: String(err) });
    }

    return { sessionId: session.id, callEnded: true };
  }

  return { sessionId: session.id, callEnded: false };
}

/**
 * Force-leave a user from any active call they are in. Called by kick/ban
 * services when membership is removed. No permission check — the caller
 * (admin action) has already been verified.
 *
 * Returns the channelId if the user was in a call, so the caller can emit
 * the appropriate socket event.
 */
export async function forceLeaveCall(
  userId: string,
): Promise<{
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
        select: { id: true, channelId: true },
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
    const roomName = liveKitRoomName(participant.session.channelId);
    await roomClient.removeParticipant(roomName, `user:${userId}`);
  } catch {
    // LiveKit room may already be gone — non-fatal.
  }

  // Check if session should end.
  const remaining = await prisma.callParticipant.count({
    where: { sessionId: participant.session.id, leftAt: null },
  });

  let callEnded = false;
  if (remaining === 0) {
    await prisma.callSession.update({
      where: { id: participant.session.id },
      data: { endedAt: new Date() },
    });
    callEnded = true;

    try {
      const roomClient = getLiveKitRoomClient();
      await roomClient.deleteRoom(
        liveKitRoomName(participant.session.channelId),
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
    channelId: participant.session.channelId,
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
  const roomName = liveKitRoomName(channelId);
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

/**
 * Remove participants whose sessions ended or who haven't left within the
 * grace period. Run on server startup and periodically.
 */
export async function reapStaleParticipants(): Promise<number> {
  // 1. Mark participants in ended sessions as left (defensive cleanup).
  const endedSessionResult = await prisma.callParticipant.updateMany({
    where: {
      leftAt: null,
      session: { endedAt: { not: null } },
    },
    data: { leftAt: new Date() },
  });

  // 2. For each active session, reconcile DB participants against the LiveKit
  //    room's live participant list. Only mark absent participants as stale —
  //    this correctly handles browser crashes without evicting active long calls.
  const activeSessions = await prisma.callSession.findMany({
    where: { endedAt: null },
    include: {
      participants: {
        where: { leftAt: null },
        select: { id: true, userId: true },
      },
    },
  });

  const roomClient = getLiveKitRoomClient();
  let orphanedCount = 0;

  for (const session of activeSessions) {
    if (session.participants.length === 0) continue;

    const roomName = liveKitRoomName(session.channelId);
    let liveIdentities: Set<string>;

    try {
      const lkParticipants = await roomClient.listParticipants(roomName);
      liveIdentities = new Set(lkParticipants.map((p) => p.identity));
    } catch {
      // LiveKit room doesn't exist or is unreachable — treat all DB participants
      // for this session as stale (room was likely deleted externally).
      liveIdentities = new Set();
    }

    // Participants present in DB but absent from LiveKit are stale.
    const staleIds = session.participants
      .filter((p) => !liveIdentities.has(`user:${p.userId}`))
      .map((p) => p.id);

    if (staleIds.length > 0) {
      await prisma.callParticipant.updateMany({
        where: { id: { in: staleIds } },
        data: { leftAt: new Date() },
      });
      orphanedCount += staleIds.length;
      log.info("Reaped stale participants via LiveKit reconciliation", {
        sessionId: session.id,
        channelId: session.channelId,
        count: staleIds.length,
      });
    }

    // End the session if no participants remain after reaping.
    const remaining = await prisma.callParticipant.count({
      where: { sessionId: session.id, leftAt: null },
    });
    if (remaining === 0) {
      await prisma.callSession.update({
        where: { id: session.id },
        data: { endedAt: new Date() },
      });
      log.info("Call session ended during stale reap", {
        sessionId: session.id,
        channelId: session.channelId,
      });
    }
  }

  const total = endedSessionResult.count + orphanedCount;
  if (total > 0) {
    log.info("Reaped stale participants total", { count: total });
  }

  return total;
}

/**
 * End all active call sessions on server startup. Clients will reconnect
 * and re-join if they're still in a call.
 */
export async function endAllActiveSessions(): Promise<void> {
  const activeSessions = await prisma.callSession.findMany({
    where: { endedAt: null },
    select: { id: true },
  });

  if (activeSessions.length === 0) return;

  const ids = activeSessions.map((s) => s.id);
  await prisma.$transaction([
    prisma.callParticipant.updateMany({
      where: { sessionId: { in: ids }, leftAt: null },
      data: { leftAt: new Date() },
    }),
    prisma.callSession.updateMany({
      where: { id: { in: ids } },
      data: { endedAt: new Date() },
    }),
  ]);

  log.info("Ended all active call sessions on startup", { count: ids.length });
}
