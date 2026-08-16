import type { Server } from "socket.io";
import type { ServerToClientEvents } from "../types/socket-events";

// ---------------------------------------------------------------------------
// Room helpers — no raw string literals
// ---------------------------------------------------------------------------

export function getUserRoom(userId: string): string {
  return `user:${userId}`;
}

// ---------------------------------------------------------------------------
// Emit helpers — typed payloads, no raw event strings in routes/services
// ---------------------------------------------------------------------------

export function emitFriendRequestCreated(
  io: Server,
  userId: string,
  payload: Parameters<ServerToClientEvents["friend-request:new"]>[0],
) {
  io.to(getUserRoom(userId)).emit("friend-request:new", payload);
}

export function emitFriendRequestAccepted(
  io: Server,
  userId: string,
  payload: Parameters<ServerToClientEvents["friend-request:accepted"]>[0],
) {
  io.to(getUserRoom(userId)).emit("friend-request:accepted", payload);
}

export function emitFriendRequestDeclined(
  io: Server,
  userId: string,
  payload: Parameters<ServerToClientEvents["friend-request:declined"]>[0],
) {
  io.to(getUserRoom(userId)).emit("friend-request:declined", payload);
}

export function emitFriendRequestBlocked(
  io: Server,
  userId: string,
  payload: Parameters<ServerToClientEvents["friend-request:blocked"]>[0],
) {
  io.to(getUserRoom(userId)).emit("friend-request:blocked", payload);
}
