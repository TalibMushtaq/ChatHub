import socketAuth from "./middleware/io.Auth";
import { registerRoomChat } from "./routes/room/roomChat";
import { registerDirectChat } from "./sockets/direct-chat";
import { Server } from "socket.io";
import type { Server as HTTPServer } from "http";
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
    sessionMiddleware(socket.request as any, {} as any, next as any);
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
