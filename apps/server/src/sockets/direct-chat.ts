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
// Socket registration
// ---------------------------------------------------------------------------

export function registerDirectChat(
  _io: Server<
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
}
