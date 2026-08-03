import { Router } from "express";
import { prisma } from "../../db/prisma";
import requireAuth from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/async-handler";
import { createRateLimiter, setRateLimitHeaders } from "../lib/rateLimiter";
import { ApiError } from "../lib/ApiError";
import { createLogger } from "../lib/logger";
import { searchUsersQuerySchema, userIdParamSchema } from "@repo/validators";

const log = createLogger("searchUser");
const router = Router();

// Redis-backed rate limiters: fail open if Redis is down so a cache outage
// does not cause a full search outage.
const searchLimiter = createRateLimiter({
  maxAttempts: 20,
  windowMs: 60_000,
  prefix: "search:user",
});

const lookupLimiter = createRateLimiter({
  maxAttempts: 40,
  windowMs: 60_000,
  prefix: "search:lookup",
});

// GET /api/search/users/search
// Must be registered BEFORE /users/:id so Express does not treat "search"
// as a user ID parameter.
router.get(
  "/users/search",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = searchUsersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      // Return the first validation issue as a human-readable message.
      // Zod issues are not leaked to the client to avoid enumeration.
      res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid search parameters",
      });
      return;
    }

    const { query, limit, cursor } = parsed.data;
    const actorId = req.user.id;

    // Rate-limit per authenticated user to prevent enumeration attacks
    // and to protect the database from expensive wildcard queries.
    const rate = await searchLimiter(actorId);
    setRateLimitHeaders(res, rate);
    if (!rate.allowed) {
      res.status(429).json({ ok: false, error: "Rate limit exceeded" });
      return;
    }

    const start = Date.now();

    // Use startsWith instead of contains so PostgreSQL can leverage a B-tree
    // index on username. contains with a leading wildcard (%term%) forces a
    // full table scan and will not scale as the user table grows.
    const users = await prisma.user.findMany({
      where: {
        username: { startsWith: query, mode: "insensitive" },
        id: { not: actorId },
      },
      select: { id: true, username: true, displayname: true },
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { username: "asc" },
    });

    // Structured logging gives ops visibility into search latency and volume
    // without leaking result payloads into the logs.
    log.info("User search executed", {
      actorId,
      query,
      durationMs: Date.now() - start,
      resultCount: users.length,
    });

    res.status(200).json({
      ok: true,
      users,
      nextCursor:
        users.length === limit ? users[users.length - 1]?.id : undefined,
    });
  }),
);

// GET /api/search/users/:id
router.get(
  "/users/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = userIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid user ID",
      });
      return;
    }

    const { id } = parsed.data;

    // Rate-limit lookups to prevent bulk scraping of user profiles by ID.
    const rate = await lookupLimiter(req.user.id);
    setRateLimitHeaders(res, rate);
    if (!rate.allowed) {
      res.status(429).json({ ok: false, error: "Rate limit exceeded" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, displayname: true, avatar: true },
    });

    if (!user) {
      // Throwing ApiError lets the centralized error handler translate this
      // into a consistent 404 response with the { ok: false } envelope.
      throw new ApiError("User not found", 404, "USER_NOT_FOUND");
    }

    res.status(200).json({ ok: true, user });
  }),
);

export default router;
