import "express-session";
import type { AuthUser } from "./express";

declare module "express-session" {
  interface SessionData {
    userId?: string;

    userCache?: {
      user: AuthUser;
      cachedAt: number;
    };
  }
}
