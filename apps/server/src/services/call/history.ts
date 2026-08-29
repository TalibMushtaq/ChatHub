import type { Server } from "socket.io";
import type { CallType, CallOutcome } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { SYSTEM_USER_ID } from "../../../db/systemUser";
import { createLogger } from "../../lib/logger";
import { checkIdempotency, storeIdempotency } from "../idempotency";
import { toRoomMessagePayload } from "../../constants/room";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../../types/socket-events";

const log = createLogger("call-history");

/** Socket.IO server type — matches how req.io / index.ts construct it. */
export type CallIO = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/** Where a call session lives — either a DM or a room voice channel. */
export type CallHistoryTarget =
  | { type: "direct"; directChatId: string }
  | { type: "channel"; roomId: string; channelId: string };

/**
 * Select shape for a call-history system message. Carries both `directChatId`
 * and `chatRoomId`/`channelId` so the same payload feeds the DM `message:new`
 * broadcast and the room `chatroom:message` broadcast without a second query.
 */
export const callHistoryMessageSelect = {
  id: true,
  content: true,
  senderId: true,
  messageType: true,
  createdAt: true,
  metadata: true,
  isDeleted: true,
  directChatId: true,
  chatRoomId: true,
  channelId: true,
} as const;

export type CallHistoryMessage = Awaited<
  ReturnType<typeof createCallHistoryMessage>
>;

/**
 * Human-readable call-history line, e.g. "Missed voice call" or
 * "Video call · 5:32". Duration is only appended for completed calls.
 */
export function buildCallHistoryContent(
  callType: CallType,
  outcome: CallOutcome,
  durationSeconds: number | null,
): string {
  const typeLabel = callType === "VIDEO" ? "Video call" : "Voice call";
  if (outcome === "MISSED") return `Missed ${typeLabel.toLowerCase()}`;
  if (outcome === "DECLINED") return `Declined ${typeLabel.toLowerCase()}`;
  if (outcome === "CANCELLED") return `${typeLabel} cancelled`;
  if (durationSeconds != null) {
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    return `${typeLabel} \u00b7 ${mins}:${secs.toString().padStart(2, "0")}`;
  }
  return typeLabel;
}

/**
 * Create a call-history system message. Idempotent per session via
 * checkIdempotency("system", "call-history:{sessionId}") — safe to call
 * multiple times for the same session (e.g. concurrent leave paths).
 *
 * Returns the created message payload, or null when a history message already
 * exists for this session.
 */
export async function createCallHistoryMessage(params: {
  sessionId: string;
  callType: CallType;
  outcome: CallOutcome;
  target: CallHistoryTarget;
}) {
  const idempotencyKey = `call-history:${params.sessionId}`;
  const existing = await checkIdempotency("system", idempotencyKey);
  if (existing) return null;

  // Fetch session for duration calculation (duration = endedAt - connectedAt).
  const session = await prisma.callSession.findUnique({
    where: { id: params.sessionId },
    select: { connectedAt: true, endedAt: true },
  });

  let durationSeconds: number | null = null;
  if (session?.connectedAt && session?.endedAt) {
    durationSeconds = Math.round(
      (session.endedAt.getTime() - session.connectedAt.getTime()) / 1000,
    );
  }

  const message = await prisma.message.create({
    data: {
      content: buildCallHistoryContent(
        params.callType,
        params.outcome,
        durationSeconds,
      ),
      senderId: SYSTEM_USER_ID,
      messageType: "SYSTEM",
      metadata: {
        kind: "call",
        callSessionId: params.sessionId,
        callType: params.callType,
        outcome: params.outcome,
        durationSeconds,
      },
      ...(params.target.type === "direct"
        ? { directChatId: params.target.directChatId }
        : {
            chatRoomId: params.target.roomId,
            channelId: params.target.channelId,
          }),
    },
    select: callHistoryMessageSelect,
  });

  await storeIdempotency("system", idempotencyKey, message.id);

  log.info("Created call-history message", {
    messageId: message.id,
    sessionId: params.sessionId,
    target: params.target,
    outcome: params.outcome,
    durationSeconds,
  });

  return message;
}

/**
 * Broadcast a freshly-created call-history message to the live room for the
 * target. DM messages ride the same `message:new` + `inbox:update` events as
 * regular DM messages; room messages ride `chatroom:message`.
 */
export function emitCallHistoryMessage(
  io: CallIO | undefined,
  target: CallHistoryTarget,
  message: NonNullable<CallHistoryMessage>,
): void {
  if (!io) return;
  // System messages never carry attachments; satisfy the socket payload shape.
  const payload = { ...message, attachments: [] as never[] };
  if (target.type === "direct") {
    io.to(`directChat:${target.directChatId}`).emit("message:new", payload);
    io.to(`directChat:${target.directChatId}`).emit("inbox:update", {
      directChatId: target.directChatId,
    });
  } else {
    io.to(`room:${target.roomId}`).emit(
      "chatroom:message",
      toRoomMessagePayload(payload),
    );
  }
}
