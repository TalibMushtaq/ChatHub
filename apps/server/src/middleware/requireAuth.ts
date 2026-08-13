import type { Request, Response, NextFunction } from "express";
import { prisma } from "../../db/prisma";
import { createLogger } from "../lib/logger";

const log = createLogger("requireAuth");

// Cache TTL: how long to trust the session-stashed user before re-fetching.
// 5 minutes balances freshness vs. DB load for high-traffic endpoints.
const CACHE_TTL_MS = 1000 * 60 * 5;

/**
 * Express middleware: verifies the request has an authenticated session,
 * attaches `req.user` with the minimal user snapshot, and short-circuits
 * with 401 if not.
 *
 * Caching strategy:
 * - On cache hit (valid TTL), skips the DB query entirely.
 * - On cache miss or stale cache, fetches from Prisma and writes to session.
 * - If the user no longer exists in DB, destroys the session and returns 401.
 *
 * Why a session cache:
 * - Every authenticated HTTP request passes through this middleware.
 * - Without caching, even a single page-load triggers 5-10 DB queries
 *   (one per API call) for the same unchanged user row.
 * - The session store (Redis) already holds the session; stashing the user
 *   snapshot there avoids a Prisma round-trip on every request.
 */
export default function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const userId = req.session.userId;

  if (!userId) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  // ------------------------- Fast path: session cache -------------------------

  const cached = req.session.userCache;

  if (
    cached?.user.id === userId &&
    Date.now() - cached.cachedAt < CACHE_TTL_MS
  ) {
    req.user = cached.user;
    next();
    return;
  }

  // -------------------------- Slow path: DB fetch -----------------------------

  prisma.user
    .findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatar: true,
        bio: true,
        gender: true,
        dateOfBirth: true,
        createdAt: true,
      },
    })
    .then((user) => {
      if (!user) {
        // Session references a user that no longer exists — invalidate it.
        req.session.destroy((err) => {
          if (err) {
            log.error("Failed to destroy stale session", err, { userId });
          }
        });
        res.status(401).json({ ok: false, error: "Unauthorized" });
        return;
      }

      // Stash in session for subsequent requests within the TTL window.
      req.session.userCache = {
        user,
        cachedAt: Date.now(),
      };

      req.user = user;
      next();
    })
    .catch((err: unknown) => {
      log.error("Database error in auth middleware", err, { userId });
      res.status(500).json({ ok: false, error: "Internal server error" });
    });
}
