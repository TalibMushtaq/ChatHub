import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";
import { redis } from "../../lib/redis";
import { getLiveKitRoomClient } from "../../lib/livekit";
import { createLogger } from "../../lib/logger";
import {
  createOrReuseSession,
  upsertParticipant,
  markParticipantLeft,
  endSessionIfEmpty,
  endSession,
  generateCallToken,
} from "../call/core";
import {
  createCallHistoryMessage,
  emitCallHistoryMessage,
  type CallIO,
} from "../call/history";
import type { CallTarget } from "../../types/call";
import type { CallType, CallOutcome } from "@prisma/client";

const log = createLogger("dm-call");

const CONNECTED_TTL_SECONDS = 300;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function connectedKey(sessionId: string, userId: string): string {
  return `dmcall:connected:${sessionId}:${userId}`;
}

function assertDmCallSession(
  session: {
    id: string;
    channelId: string | null;
    directChatId: string | null;
  } | null,
): asserts session is { id: string; channelId: null; directChatId: string } {
  if (!session || !session.directChatId) {
    throw new ApiError("No active DM call", 404, "NO_ACTIVE_CALL");
  }
}

/**
 * Select shape that satisfies assertDmCallSession.
 */
const dmCallSessionSelect = {
  id: true,
  channelId: true,
  directChatId: true,
} as const;

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Initiate a DM call. Creates a RINGING session, upserts the caller as a
 * participant, and returns a LiveKit token so the caller can join immediately.
 */
export async function initiateDmCall(
  callerId: string,
  directChatId: string,
  callType: CallType,
): Promise<{
  sessionId: string;
  token: string;
  livekitUrl: string;
  roomName: string;
}> {
  const target: CallTarget = { type: "direct", directChatId };
  const { session, isNewSession } = await createOrReuseSession(
    target,
    callType,
    "RINGING",
  );

  await upsertParticipant(session.id, callerId);

  const { token, livekitUrl, roomName } = await generateCallToken(
    callerId,
    target,
    session.id,
  );

  log.info("DM call initiated", {
    sessionId: session.id,
    callerId,
    directChatId,
    callType,
    isNewSession,
  });

  return { sessionId: session.id, token, livekitUrl, roomName };
}

/**
 * Accept a DM call. Returns the directChatId so the route can emit the
 * accepted signal. Does NOT change session status — that happens when both
 * participants connect to LiveKit (see handleLiveKitConnected).
 */
export async function acceptDmCall(
  calleeId: string,
  directChatId: string,
): Promise<{ sessionId: string }> {
  // Match ACTIVE too: a new initiate reuses an existing ACTIVE session
  // (createOrReuseSession), so the callee accepting a ringing call that was
  // already promoted to ACTIVE must still resolve to it.
  const session = await prisma.callSession.findFirst({
    where: { directChatId, status: { in: ["RINGING", "ACTIVE"] }, endedAt: null },
    select: dmCallSessionSelect,
  });
  assertDmCallSession(session);

  log.info("DM call accepted", {
    sessionId: session.id,
    calleeId,
    directChatId,
  });
  return { sessionId: session.id };
}

/**
 * Decline a DM call. Ends the session with DECLINED outcome and creates a
 * call-history system message (broadcast live when io is provided).
 */
export async function declineDmCall(
  calleeId: string,
  directChatId: string,
  io?: CallIO,
): Promise<{ sessionId: string }> {
  const session = await prisma.callSession.findFirst({
    where: { directChatId, status: "RINGING", endedAt: null },
    select: { ...dmCallSessionSelect, callType: true },
  });
  assertDmCallSession(session);

  await endSession(session.id, "DECLINED");
  const message = await createCallHistoryMessage({
    sessionId: session.id,
    callType: session.callType,
    outcome: "DECLINED",
    target: { type: "direct", directChatId },
  });
  if (message) {
    emitCallHistoryMessage(io, { type: "direct", directChatId }, message);
  }

  log.info("DM call declined", {
    sessionId: session.id,
    calleeId,
    directChatId,
  });
  return { sessionId: session.id };
}

/**
 * Cancel a DM call (caller-initiated). Ends the session with CANCELLED
 * outcome and creates a call-history system message.
 */
export async function cancelDmCall(
  callerId: string,
  directChatId: string,
  io?: CallIO,
): Promise<{ sessionId: string }> {
  const session = await prisma.callSession.findFirst({
    where: { directChatId, status: "RINGING", endedAt: null },
    select: { ...dmCallSessionSelect, callType: true },
  });
  assertDmCallSession(session);

  await endSession(session.id, "CANCELLED");
  const message = await createCallHistoryMessage({
    sessionId: session.id,
    callType: session.callType,
    outcome: "CANCELLED",
    target: { type: "direct", directChatId },
  });
  if (message) {
    emitCallHistoryMessage(io, { type: "direct", directChatId }, message);
  }

  log.info("DM call cancelled", {
    sessionId: session.id,
    callerId,
    directChatId,
  });
  return { sessionId: session.id };
}

/**
 * Join an active DM call. Upserts the participant and returns a LiveKit token.
 * Only works for RINGING or ACTIVE sessions.
 */
export async function joinDmCall(
  userId: string,
  directChatId: string,
): Promise<{
  sessionId: string;
  token: string;
  livekitUrl: string;
  roomName: string;
}> {
  const session = await prisma.callSession.findFirst({
    where: {
      directChatId,
      status: { in: ["RINGING", "ACTIVE"] },
      endedAt: null,
    },
    select: { ...dmCallSessionSelect, callType: true },
  });
  assertDmCallSession(session);

  const target: CallTarget = { type: "direct", directChatId };
  await upsertParticipant(session.id, userId);
  const { token, livekitUrl, roomName } = await generateCallToken(
    userId,
    target,
    session.id,
  );

  log.info("DM call joined", { sessionId: session.id, userId, directChatId });
  return { sessionId: session.id, token, livekitUrl, roomName };
}

/**
 * Leave a DM call. Marks the participant as left, ends the session if empty,
 * and creates a call-history system message when the session ends.
 *
 * Returns null if the user wasn't a participant or already left.
 */
export async function leaveDmCall(
  userId: string,
  directChatId: string,
  io?: CallIO,
): Promise<{
  sessionId: string;
  callEnded: boolean;
  outcome?: CallOutcome;
} | null> {
  const session = await prisma.callSession.findFirst({
    where: { directChatId, endedAt: null },
    select: {
      id: true,
      directChatId: true,
      callType: true,
      connectedAt: true,
      startedAt: true,
    },
  });
  if (!session) return null;

  const left = await markParticipantLeft(session.id, userId);
  if (!left) return null;

  const { callEnded } = await endSessionIfEmpty(session.id);

  if (callEnded) {
    // Derive outcome from current status — if still RINGING, it was missed;
    // if ACTIVE, it was completed.
    const outcome: CallOutcome = session.connectedAt ? "COMPLETED" : "MISSED";
    await prisma.callSession.update({
      where: { id: session.id },
      data: { status: "ENDED", outcome },
    });
    const message = await createCallHistoryMessage({
      sessionId: session.id,
      callType: session.callType,
      outcome,
      target: { type: "direct", directChatId },
    });
    if (message) {
      emitCallHistoryMessage(io, { type: "direct", directChatId }, message);
    }

    // Clean up LiveKit room.
    try {
      const roomClient = getLiveKitRoomClient();
      const roomName = `dm-call:${session.id}`;
      await roomClient.deleteRoom(roomName);
    } catch (err) {
      log.warn("Failed to delete LiveKit room on leave", {
        error: String(err),
      });
    }
  }

  // Clean up Redis connected tracking.
  await redis.del(connectedKey(session.id, userId)).catch(() => {});

  log.info("DM call left", {
    sessionId: session.id,
    userId,
    directChatId,
    callEnded,
  });

  const outcome: CallOutcome | undefined = callEnded
    ? session.connectedAt
      ? "COMPLETED"
      : "MISSED"
    : undefined;
  return { sessionId: session.id, callEnded, outcome };
}

/**
 * Return the active DM call session and its current participants for a
 * direct chat. Returns null if no active call exists.
 */
export async function getActiveDmCall(directChatId: string) {
  const session = await prisma.callSession.findFirst({
    where: {
      directChatId,
      endedAt: null,
      status: { in: ["RINGING", "ACTIVE"] },
    },
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
 * Handle a participant's LiveKit connected event. Stores a Redis key so we
 * can track which participants have actually connected to the media server.
 * When both participants are connected, transitions the session to ACTIVE
 * and sets connectedAt.
 *
 * Returns { connected: true } when both participants are connected (used by
 * the socket handler to emit dmCall:connected).
 */
export async function handleLiveKitConnected(
  userId: string,
  sessionId: string,
): Promise<{ connected: boolean }> {
  const session = await prisma.callSession.findFirst({
    where: { id: sessionId, endedAt: null },
    select: { id: true, directChatId: true, status: true },
  });
  if (!session || !session.directChatId) return { connected: false };

  // Store connected key with TTL.
  await redis.set(connectedKey(sessionId, userId), "1", {
    EX: CONNECTED_TTL_SECONDS,
  });

  // Check if both participants are connected.
  const dc = await prisma.directChat.findUnique({
    where: { id: session.directChatId },
    select: { user1Id: true, user2Id: true },
  });
  if (!dc) return { connected: false };

  const [p1Connected, p2Connected] = await Promise.all([
    redis.get(connectedKey(sessionId, dc.user1Id)),
    redis.get(connectedKey(sessionId, dc.user2Id)),
  ]);

  if (p1Connected && p2Connected && session.status !== "ACTIVE") {
    await prisma.callSession.update({
      where: { id: sessionId },
      data: { status: "ACTIVE", connectedAt: new Date() },
    });
    log.info("DM call transitioned to ACTIVE", {
      sessionId,
      directChatId: session.directChatId,
    });
    return { connected: true };
  }

  return { connected: false };
}

/**
 * Handle a participant's LiveKit disconnected event. Removes their Redis
 * connected key.
 */
export async function handleLiveKitDisconnected(
  userId: string,
  sessionId: string,
): Promise<void> {
  await redis.del(connectedKey(sessionId, userId)).catch(() => {});
  log.info("DM call LiveKit disconnected", { sessionId, userId });
}
