import socketAuth from "./middleware/io.Auth";
import { registerRoomChat } from "./routes/room/roomChat";
import { registerDirectChat } from "./sockets/direct-chat";
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

    registerRoomChat(io, socket);
    registerDirectChat(io, socket);

    socket.on("disconnect", () => {
      console.log("socket disconnected :", socket.id);
    });
  });

  return io;
}
