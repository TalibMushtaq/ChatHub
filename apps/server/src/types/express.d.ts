import type { User, ChatRoomMember } from "@prisma/client";
import type { Server as IOServer } from "socket.io";

export type AuthUser = Pick<
  User,
  | "id"
  | "email"
  | "username"
  | "displayName"
  | "avatar"
  | "bio"
  | "gender"
  | "dateOfBirth"
  | "createdAt"
>;

// user is non-optional because requireAuth guarantees it is set before
// any downstream route runs; this eliminates req.user! assertions.
// membership is set by requireAdmin for admin-gated room routes.
declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
      io: IOServer;
      membership?: Pick<ChatRoomMember, "role">;
    }
  }
}

export {};
