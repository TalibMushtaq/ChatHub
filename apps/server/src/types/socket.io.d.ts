import type { User } from "@prisma/client";

/**
 * Fields the auth middleware selects from the database.
 * Keep in sync with the `select` in io.Auth.ts.
 */
type AuthUser = Pick<User, "id" | "username">;

declare module "socket.io" {
  interface SocketData {
    user: AuthUser;
    /** chatRoomId -> epoch ms at which the cached membership check expires. */
    rooms?: Map<string, number>;
    /** conversationId -> epoch ms of the last typing broadcast (anti-spam). */
    typingThrottle?: Map<string, number>;
  }
}

export type { AuthUser };
