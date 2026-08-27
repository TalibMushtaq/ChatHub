import { prisma } from "../../../db/prisma";
import {
  generateJoinToken,
  getLiveKitRoomClient,
  LIVEKIT_WS_URL,
} from "../../lib/livekit";
import { createLogger } from "../../lib/logger";
import type { CallTarget } from "../../types/call";
import { getLiveKitRoomName } from "../../types/call";
import type { CallType, Prisma } from "@prisma/client";
import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../../types/socket-events";
import { getDirectChatRoom } from "../../sockets/direct-chat";
import { createCallHistoryMessage, emitCallHistoryMessage } from "./history";

const log = createLogger("call-core");

/**
 * Atomic create-or-reuse a CallSession via the partial unique index.
 * On P2002 (unique violation), falls back to findFirst to return the
 * existing active session — handles the race of two concurrent initiates.
 */
export async function createOrReuseSession(
  target: CallTarget,
  callType: CallType,
  status: "RINGING" | "ACTIVE" = "ACTIVE",
): Promise<{
  session: {
    id: string;
    channelId: string | null;
    directChatId: string | null;
  };
  isNewSession: boolean;
}> {
  const data: Prisma.CallSessionCreateInput = {
    callType,
    status,
    ...(target.type === "channel"
      ? { Channel: { connect: { id: target.channelId } } }
      : { DirectChat: { connect: { id: target.directChatId } } }),
  };

  try {
    const session = await prisma.callSession.create({ data });
    log.info("Created new call session", {
      sessionId: session.id,
      target,
      callType,
      status,
    });
    return { session, isNewSession: true };
  } catch (err: unknown) {
    // P2002 = unique constraint violation — another concurrent call won.
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      const existing = await prisma.callSession.findFirst({
        where:
          target.type === "channel"
            ? {
                channelId: target.channelId,
                endedAt: null,
                status: { in: ["RINGING", "ACTIVE"] },
              }
            : {
                directChatId: target.directChatId,
                endedAt: null,
                status: { in: ["RINGING", "ACTIVE"] },
              },
        select: { id: true, channelId: true, directChatId: true },
      });
      if (existing) {
        return { session: existing, isNewSession: false };
      }
    }
    throw err;
  }
}

/**
 * Upsert a CallParticipant with leftAt: null (handles re-join without
 * leaving first).
 */
export async function upsertParticipant(
  sessionId: string,
  userId: string,
): Promise<void> {
  await prisma.callParticipant.upsert({
    where: { sessionId_userId: { sessionId, userId } },
    create: { sessionId, userId },
    update: { leftAt: null, joinedAt: new Date() },
  });
}

/**
 * Mark a participant as having left (leftAt = now).
 */
export async function markParticipantLeft(
  sessionId: string,
  userId: string,
): Promise<{ participantId: string } | null> {
  const participant = await prisma.callParticipant.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
  });
  if (!participant || participant.leftAt) return null;

  await prisma.callParticipant.update({
    where: { id: participant.id },
    data: { leftAt: new Date() },
  });

  return { participantId: participant.id };
}

/**
 * Check if the session has zero remaining participants; if so, end it.
 * Uses SELECT … FOR UPDATE to prevent a concurrent join from seeing stale data.
 *
 * Returns { callEnded: true } if the session was terminated.
 */
export async function endSessionIfEmpty(
  sessionId: string,
): Promise<{ callEnded: boolean }> {
  return prisma.$transaction(async (tx) => {
    // Lock the session row so concurrent leave/join operations serialize.
    const session = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "CallSession" WHERE id = ${sessionId} FOR UPDATE`;

    if (!session.length) return { callEnded: false };

    const remaining = await tx.callParticipant.count({
      where: { sessionId, leftAt: null },
    });

    if (remaining === 0) {
      await tx.callSession.update({
        where: { id: sessionId },
        data: { endedAt: new Date(), outcome: "COMPLETED" },
      });
      log.info("Call session ended (no participants)", { sessionId });
      return { callEnded: true };
    }

    return { callEnded: false };
  });
}

/**
 * End a session with a specific outcome (for DM calls that end abnormally).
 */
export async function endSession(
  sessionId: string,
  outcome: "COMPLETED" | "MISSED" | "DECLINED" | "CANCELLED" | "FAILED",
): Promise<void> {
  await prisma.$transaction([
    prisma.callParticipant.updateMany({
      where: { sessionId, leftAt: null },
      data: { leftAt: new Date() },
    }),
    prisma.callSession.update({
      where: { id: sessionId },
      data: { endedAt: new Date(), status: "ENDED", outcome },
    }),
  ]);
  log.info("Call session ended with outcome", { sessionId, outcome });
}

/**
 * Generate a LiveKit JWT for the given user + call target.
 */
export async function generateCallToken(
  userId: string,
  target: CallTarget,
  sessionId: string,
): Promise<{ token: string; livekitUrl: string; roomName: string }> {
  const roomName = getLiveKitRoomName(target, sessionId);
  const token = await generateJoinToken(userId, roomName);
  return { token, livekitUrl: LIVEKIT_WS_URL, roomName };
}

/**
 * Remove participants whose sessions ended or who haven't left within the
 * grace period. Reconciles DB against the LiveKit participant list.
 * Runs on server startup and periodically (every 5 min).
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
  //    room's live participant list.
  const activeSessions = await prisma.callSession.findMany({
    where: { endedAt: null },
    select: {
      id: true,
      channelId: true,
      directChatId: true,
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

    // Derive LiveKit room name from target type.
    const target: CallTarget =
      session.channelId != null
        ? { type: "channel", roomId: "", channelId: session.channelId }
        : { type: "direct", directChatId: session.directChatId! };
    const roomName = getLiveKitRoomName(target, session.id);

    let liveIdentities: Set<string>;
    try {
      const lkParticipants = await roomClient.listParticipants(roomName);
      liveIdentities = new Set(lkParticipants.map((p) => p.identity));
    } catch {
      // LiveKit room unreachable — treat all DB participants as stale.
      liveIdentities = new Set();
    }

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
        target,
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
        data: { endedAt: new Date(), outcome: "COMPLETED" },
      });
      log.info("Call session ended during stale reap", {
        sessionId: session.id,
        target,
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
 * End all active call sessions on server startup.
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
      data: { endedAt: new Date(), outcome: "COMPLETED" },
    }),
  ]);

  log.info("Ended all active call sessions on startup", { count: ids.length });
}

/**
 * End all RINGING DM sessions older than the ringing timeout.
 * Called every 10 seconds from index.ts.
 *
 * Emits `dmCall:ended` + `dmCall:dismiss` to affected rooms/users so
 * clients clear stale ringing UI.
 */
export async function timeoutRingingCalls(
  io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >,
): Promise<number> {
  const threshold = new Date(Date.now() - 60_000);

  const result = await prisma.$transaction(async (tx) => {
    const stale = await tx.callSession.findMany({
      where: { status: "RINGING", startedAt: { lt: threshold } },
      select: { id: true, directChatId: true, callType: true },
    });

    if (stale.length === 0)
      return {
        count: 0,
        ended: [] as {
          id: string;
          directChatId: string | null;
          callType: CallType;
        }[],
      };

    const ids = stale.map((s) => s.id);
    await tx.callParticipant.updateMany({
      where: { sessionId: { in: ids }, leftAt: null },
      data: { leftAt: new Date() },
    });
    await tx.callSession.updateMany({
      where: { id: { in: ids } },
      data: { endedAt: new Date(), status: "ENDED", outcome: "MISSED" },
    });

    return { count: stale.length, ended: stale };
  });

  if (result.count > 0) {
    log.info("Timed out ringing DM calls", { count: result.count });

    // Emit socket events for each timed-out DM session so clients clear
    // the ringing UI and receive the dismiss signal.
    for (const session of result.ended) {
      if (!session.directChatId) continue;

      const room = getDirectChatRoom(session.directChatId);

      io.to(room).emit("dmCall:ended", {
        directChatId: session.directChatId,
        sessionId: session.id,
        outcome: "MISSED",
      });

      // Record the missed-call history message in the DM timeline.
      const message = await createCallHistoryMessage({
        sessionId: session.id,
        callType: session.callType,
        outcome: "MISSED",
        target: { type: "direct", directChatId: session.directChatId },
      });
      if (message) {
        emitCallHistoryMessage(
          io,
          { type: "direct", directChatId: session.directChatId },
          message,
        );
      }

      // Fetch both participant userIds so we can emit dismiss to each.
      const dc = await prisma.directChat.findUnique({
        where: { id: session.directChatId },
        select: { user1Id: true, user2Id: true },
      });
      if (dc) {
        io.to(`user:${dc.user1Id}`).emit("dmCall:dismiss", {
          directChatId: session.directChatId,
          sessionId: session.id,
          reason: "timeout",
        });
        io.to(`user:${dc.user2Id}`).emit("dmCall:dismiss", {
          directChatId: session.directChatId,
          sessionId: session.id,
          reason: "timeout",
        });
      }
    }
  }

  return result.count;
}
