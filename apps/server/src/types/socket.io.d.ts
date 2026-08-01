import type { User } from "@prisma/client";

/**
 * Fields the auth middleware selects from the database.
 * Keep in sync with the `select` in io.Auth.ts.
 */
type AuthUser = Pick<User, "id" | "username">;

declare module "socket.io" {
  interface SocketData {
    user: AuthUser;
    rooms?: Set<string>;
  }
}

export type { AuthUser };
