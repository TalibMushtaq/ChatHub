import type { User } from "@prisma/client";
import type { Server as IOServer } from "socket.io";

export type AuthUser = Pick<
  User,
  "id" | "email" | "username" | "displayname" | "avatar" | "createdAt"
>;

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      io: IOServer;
    }
  }
}

export {};
