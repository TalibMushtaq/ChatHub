import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../types/socket-events";
import { assertDirectChatAccess } from "../middleware/socketAccess";
import { ApiError } from "../lib/ApiError";
import { createLogger } from "../lib/logger";
import { directChatTypingSchema } from "@repo/validators";
import {
  handleLiveKitConnected,
  handleLiveKitDisconnected,
} from "../services/direct-chat/call";
import { prisma } from "../../db/prisma";

const log = createLogger("directChatSocket");

// Throttle typing broadcasts so a fast typist doesn't saturate the socket.
// The client re-emits periodically while typing and always sends the final
// "stopped" event, so a dropped intermediate "start" is harmless.
const TYPING_THROTTLE_MS = 1500;

// ---------------------------------------------------------------------------
// Room helpers — no raw string literals
// ---------------------------------------------------------------------------

export function getDirectChatRoom(directChatId: string): string {
  return `directChat:${directChatId}`;
}

// ---------------------------------------------------------------------------
// Emit helpers — typed payloads, no raw event strings in routes/services
// ---------------------------------------------------------------------------

export function emitMessageCreated(
  io: Server,
  room: string,
  payload: Parameters<ServerToClientEvents["message:new"]>[0],
) {
  io.to(room).emit("message:new", payload);
}

export function emitMessageEdited(
  io: Server,
  room: string,
  payload: Parameters<ServerToClientEvents["message:edited"]>[0],
) {
  io.to(room).emit("message:edited", payload);
}

export function emitMessageDeleted(
  io: Server,
  room: string,
  payload: Parameters<ServerToClientEvents["message:deleted"]>[0],
) {
  io.to(room).emit("message:deleted", payload);
}

export function emitInboxUpdated(
  io: Server,
  room: string,
  payload: Parameters<ServerToClientEvents["inbox:update"]>[0],
) {
  io.to(room).emit("inbox:update", payload);
}

export function emitDirectChatRead(
  io: Server,
  userRoom: string,
  payload: Parameters<ServerToClientEvents["directChat:read"]>[0],
) {
  io.to(userRoom).emit("directChat:read", payload);
}

export function emitChatRoomRead(
  io: Server,
  userRoom: string,
  payload: Parameters<ServerToClientEvents["chatroom:read"]>[0],
) {
  io.to(userRoom).emit("chatroom:read", payload);
}

// ---------------------------------------------------------------------------
// DM Call emit helpers
// ---------------------------------------------------------------------------

export function emitDmCallConnected(
  io: Server,
  room: string,
  payload: Parameters<ServerToClientEvents["dmCall:connected"]>[0],
) {
  io.to(room).emit("dmCall:connected", payload);
}

export function emitDmCallParticipantJoined(
  io: Server,
  room: string,
  payload: Parameters<ServerToClientEvents["dmCall:participant.joined"]>[0],
) {
  io.to(room).emit("dmCall:participant.joined", payload);
}

export function emitDmCallParticipantLeft(
  io: Server,
  room: string,
  payload: Parameters<ServerToClientEvents["dmCall:participant.left"]>[0],
) {
  io.to(room).emit("dmCall:participant.left", payload);
}

// ---------------------------------------------------------------------------
// Socket registration
// ---------------------------------------------------------------------------

export function registerDirectChat(
  io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >,
  socket: Socket<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >,
) {
  const { user } = socket.data;

  socket.on("directChat:join", async ({ directChatId }) => {
    try {
      await assertDirectChatAccess(user.id, directChatId);
      socket.join(getDirectChatRoom(directChatId));
      socket.emit("directChat:joined", { directChatId });
    } catch (err: unknown) {
      // Narrow to ApiError to preserve the machine-readable code and message;
      // anything else is unexpected, so it is logged server-side and reported
      // to the client as a generic structured failure.
      if (err instanceof ApiError) {
        socket.emit("directChat:error", {
          code: err.code ?? "JOIN_FAILED",
          message: err.message,
        });
        return;
      }
      log.error("directChat:join failed", err, {
        userId: user.id,
        directChatId,
      });
      socket.emit("directChat:error", {
        code: "JOIN_FAILED",
        message: err instanceof Error ? err.message : "Failed to join chat",
      });
    }
  });

  socket.on("directChat:leave", async ({ directChatId }) => {
    try {
      await assertDirectChatAccess(user.id, directChatId);
      socket.leave(getDirectChatRoom(directChatId));
      socket.emit("directChat:left", { directChatId });
    } catch (err: unknown) {
      // Same narrowing strategy as join: preserve ApiError codes,
      // log and generalize everything else.
      if (err instanceof ApiError) {
        socket.emit("directChat:error", {
          code: err.code ?? "LEAVE_FAILED",
          message: err.message,
        });
        return;
      }
      log.error("directChat:leave failed", err, {
        userId: user.id,
        directChatId,
      });
      socket.emit("directChat:error", {
        code: "LEAVE_FAILED",
        message: err instanceof Error ? err.message : "Failed to leave chat",
      });
    }
  });

  socket.on("directChat:typing", async (payload: unknown) => {
    const parsed = directChatTypingSchema.safeParse(payload);
    if (!parsed.success) return;
    const { directChatId, isTyping } = parsed.data;
    // Privacy gate: a user who disabled typing visibility never emits typing
    // events. Both the start and the stop are dropped so receivers never see a
    // stale indicator (they never saw a start).
    if (user.showTypingStatus === false) return;
    try {
      await assertDirectChatAccess(user.id, directChatId);
      const throttle = (socket.data.typingThrottle ??= new Map());
      const now = Date.now();
      if (
        isTyping &&
        now - (throttle.get(directChatId) ?? 0) < TYPING_THROTTLE_MS
      ) {
        return;
      }
      throttle.set(directChatId, now);
      // Broadcast to every participant except the sender, so only the other
      // side sees the indicator.
      socket.broadcast
        .to(getDirectChatRoom(directChatId))
        .emit("directChat:typing", {
          userId: user.id,
          username: user.username,
          directChatId,
          isTyping,
        });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        socket.emit("directChat:error", {
          code: err.code ?? "JOIN_FAILED",
          message: err.message,
        });
        return;
      }
      log.error("directChat:typing failed", err, {
        userId: user.id,
        directChatId,
      });
    }
  });

  // -----------------------------------------------------------------------
  // DM Call — LiveKit connection tracking
  // -----------------------------------------------------------------------

  socket.on("dmCall:livekitConnected", async (payload: unknown) => {
    const { sessionId } = (payload as { sessionId?: string }) ?? {};
    if (!sessionId) return;

    try {
      const { connected } = await handleLiveKitConnected(user.id, sessionId);

      const session = await prisma.callSession.findUnique({
        where: { id: sessionId },
        select: { directChatId: true },
      });
      if (!session?.directChatId) return;

      // Validate the user has access to this DM.
      await assertDirectChatAccess(user.id, session.directChatId);

      const room = getDirectChatRoom(session.directChatId);

      emitDmCallParticipantJoined(io, room, {
        directChatId: session.directChatId,
        sessionId,
        userId: user.id,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatar: null,
        },
      });

      // When both participants are connected, the call transitions to ACTIVE.
      if (connected) {
        const updated = await prisma.callSession.findUnique({
          where: { id: sessionId },
          select: { connectedAt: true },
        });
        emitDmCallConnected(io, room, {
          directChatId: session.directChatId,
          sessionId,
          connectedAt: updated?.connectedAt ?? new Date(),
        });
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        socket.emit("dmCall:error", {
          code: err.code ?? "LIVEKIT_CONNECTED_FAILED",
          message: err.message,
        });
        return;
      }
      log.error("dmCall:livekitConnected failed", err, {
        userId: user.id,
        sessionId,
      });
      socket.emit("dmCall:error", {
        code: "LIVEKIT_CONNECTED_FAILED",
        message:
          err instanceof Error
            ? err.message
            : "Failed to track LiveKit connection",
      });
    }
  });

  socket.on("dmCall:livekitDisconnected", async (payload: unknown) => {
    const { sessionId } = (payload as { sessionId?: string }) ?? {};
    if (!sessionId) return;

    try {
      await handleLiveKitDisconnected(user.id, sessionId);

      const session = await prisma.callSession.findUnique({
        where: { id: sessionId },
        select: { directChatId: true },
      });
      if (!session?.directChatId) return;

      // Validate the user has access to this DM.
      await assertDirectChatAccess(user.id, session.directChatId);

      const room = getDirectChatRoom(session.directChatId);

      emitDmCallParticipantLeft(io, room, {
        directChatId: session.directChatId,
        sessionId,
        userId: user.id,
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        socket.emit("dmCall:error", {
          code: err.code ?? "LIVEKIT_DISCONNECTED_FAILED",
          message: err.message,
        });
        return;
      }
      log.error("dmCall:livekitDisconnected failed", err, {
        userId: user.id,
        sessionId,
      });
      socket.emit("dmCall:error", {
        code: "LIVEKIT_DISCONNECTED_FAILED",
        message:
          err instanceof Error
            ? err.message
            : "Failed to track LiveKit disconnection",
      });
    }
  });

  // -----------------------------------------------------------------------
  // DM Call — Multi-device dismiss relay
  // -----------------------------------------------------------------------

  socket.on("dmCall:dismiss", async (payload: unknown) => {
    const { sessionId, reason } =
      (payload as {
        sessionId?: string;
        reason?: string;
      }) ?? {};
    if (
      !sessionId ||
      !reason ||
      !["accepted", "declined", "cancelled", "timeout"].includes(reason)
    )
      return;

    try {
      const session = await prisma.callSession.findUnique({
        where: { id: sessionId },
        select: { directChatId: true },
      });
      if (!session?.directChatId) return;

      await assertDirectChatAccess(user.id, session.directChatId);

      // Relay dismiss to the sender's own user room so all their devices
      // receive the signal and clear the call UI.
      io.to(`user:${user.id}`).emit("dmCall:dismiss", {
        directChatId: session.directChatId,
        sessionId,
        reason: reason as "accepted" | "declined" | "cancelled" | "timeout",
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        socket.emit("dmCall:error", {
          code: err.code ?? "DISMISS_FAILED",
          message: err.message,
        });
        return;
      }
      log.error("dmCall:dismiss failed", err, {
        userId: user.id,
        sessionId,
      });
    }
  });
}
