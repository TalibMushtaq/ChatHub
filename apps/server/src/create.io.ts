import socketAuth from "./middleware/io.Auth";
import { registerRoomChat } from "./routes/room/roomChat";
import { registerDirectChat } from "./sockets/direct-chat";
import {
  registerPresence,
  broadcastPresenceChanged,
  emitPresenceSnapshot,
  startPresenceSweeper,
} from "./sockets/presence";
import { trackConnection, removeConnection } from "./services/presence";
import { Server } from "socket.io";
import type { Server as HTTPServer } from "http";
import type { Request, Response } from "express";
import { sessionMiddleware } from "./middleware/session";
import { getAllowedOrigins } from "./lib/cors";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "./types/socket-events";

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export function createIO(httpServer: HTTPServer): TypedServer {
  // The `as TypedServer` cast is required because the Socket.IO constructor
  // type definitions in this version don't expose the 4 generic parameters;
  // the cast preserves full type safety for emit/on handlers downstream.
  const io = new Server(httpServer, {
    cors: {
      origin: getAllowedOrigins(),
      credentials: true,
    },
  }) as TypedServer;

  io.use((socket, next) => {
    // Express session middleware needs full Request/Response objects, but
    // Socket.IO only hands us an IncomingMessage and no response at all — the
    // middleware still works because the session cookie arrives on the socket
    // handshake. The `(err?: unknown)` wrapper is assignable to Express's
    // overloaded NextFunction, which socket.io's own next is not.
    sessionMiddleware(
      socket.request as unknown as Request,
      {} as unknown as Response,
      (err?: unknown) => {
        if (err) {
          return next(err as Error);
        }
        next();
      },
    );
  });
  io.use(socketAuth);

  io.on("connection", (socket) => {
    console.log("socket connected :", socket.id);
    const { user } = socket.data;

    socket.join(`user:${user.id}`);

    registerPresence(io, socket);
    registerRoomChat(io, socket);
    registerDirectChat(io, socket);

    // Register the connection so others learn about this user being online.
    // Fire-and-forget: the broadcast is ordered after tracking completes.
    void trackConnection(user.id, socket.id, {
      status: user.status,
      customStatus: user.customStatus,
      showOnlineStatus: user.showOnlineStatus,
      showTypingStatus: user.showTypingStatus,
    }).then(() => broadcastPresenceChanged(io, user.id));

    // Send the connecting socket the current presence of everyone else, so a
    // reload does not start with blank dots until the next presence change.
    void emitPresenceSnapshot(io, socket);

    socket.on("disconnect", () => {
      console.log("socket disconnected :", socket.id);
      void removeConnection(user.id, socket.id).then((wentOffline) => {
        if (wentOffline) {
          void broadcastPresenceChanged(io, user.id);
        }
      });
    });
  });

  // Periodically flip stale-but-connected users to "idle".
  startPresenceSweeper(io);

  return io;
}
