import type { Socket } from "socket.io";
import type { Request } from "express";
import { prisma } from "../../db/prisma";
import { createLogger } from "../lib/logger";

const log = createLogger("ioAuth");

/**
 * Socket.IO authentication middleware.
 *
 * Flow: session check → user lookup → attach to socket.data → continue.
 *
 * Changes from original:
 * - Uses socket.data.user (typed via declaration merging) instead of
 *   mutating socket.request — this is Socket.IO's recommended pattern.
 * - Removes all `as any` casts by typing the request through express-session.
 * - Logs unexpected errors server-side while returning generic errors to client.
 * - Centralizes the unauthorized response to reduce duplication.
 */
export default function socketAuth(
  socket: Socket,
  next: (err?: Error) => void,
): void {
  const req = socket.request as Request;
  const session = req.session;

  if (!session?.userId) {
    return next(new Error("Unauthorized"));
  }

  prisma.user
    .findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        username: true,
        status: true,
        customStatus: true,
        showOnlineStatus: true,
        showTypingStatus: true,
      },
    })
    .then((user) => {
      if (!user) {
        return next(new Error("Unauthorized"));
      }

      // Store only the fields downstream handlers need.
      socket.data.user = user;
      next();
    })
    .catch((err: unknown) => {
      log.error("Database error during socket authentication", err, {
        userId: session.userId,
      });
      next(new Error("Authentication failed"));
    });
}
