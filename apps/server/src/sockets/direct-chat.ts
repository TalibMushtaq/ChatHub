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

const log = createLogger("directChatSocket");

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
}
