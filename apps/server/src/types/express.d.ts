import type { User } from "@prisma/client";
import type { Server as IOServer } from "socket.io";

export type AuthUser = Pick<
  User,
  "id" | "email" | "username" | "displayname" | "avatar" | "createdAt"
>;

// user is non-optional because requireAuth guarantees it is set before
// any downstream route runs; this eliminates req.user! assertions.
declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
      io: IOServer;
    }
  }
}

export {};
