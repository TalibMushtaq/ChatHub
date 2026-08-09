import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../types/socket-events";
import { assertDirectChatAccess } from "../middleware/socketAccess";
import { ApiError } from "../lib/ApiError";

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
      // Narrow to ApiError to preserve the machine-readable code;
      // fall back to a generic code so the client always receives
      // a structured payload it can branch on.
      const code = err instanceof ApiError ? err.code : undefined;
      const message =
        err instanceof Error ? err.message : "Failed to join chat";
      socket.emit("directChat:error", {
        code: code ?? "JOIN_FAILED",
        message,
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
      // default to LEAVE_FAILED so the client never sees an unstructured error.
      const code = err instanceof ApiError ? err.code : undefined;
      const message =
        err instanceof Error ? err.message : "Failed to leave chat";
      socket.emit("directChat:error", {
        code: code ?? "LEAVE_FAILED",
        message,
      });
    }
  });
}
