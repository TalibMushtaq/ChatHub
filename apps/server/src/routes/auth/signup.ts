import { Request, Response } from "express";
import express from "express";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../../db/prisma";
import { userZod } from "@repo/validators";
import crypto from "node:crypto";
import { createRateLimiter } from "../../lib/rateLimiter";
import { createLogger } from "../../lib/logger";

const router = express.Router();
const log = createLogger("signup");

/**
 * Type guard for PrismaClientKnownRequestError.
 * We check for `code` property since the class isn't directly importable
 * from `@prisma/client` in all versions.
 */
function isPrismaKnownRequestError(err: unknown): err is { code: string; meta?: { target?: string[] } } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as Record<string, unknown>).code === "string"
  );
}
const signupRateLimiter = createRateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
});

/**
 * POST /signup
 *
 * Creates a new user account and establishes a session.
 *
 * Improvements over previous version:
 * 1. Race condition eliminated: No pre-insert existence check. We create
 *    directly and catch P2002 (unique constraint) errors. The DB is the
 *    source of truth, not a SELECT before INSERT.
 * 2. Session regeneration: After user creation, the session is regenerated
 *    to prevent session fixation attacks. The session is explicitly saved.
 * 3. Proper error typing: `err: unknown` with type narrowing instead of `any`.
 * 4. Structured logging: Uses createLogger() instead of raw console.error.
 * 5. Input normalization: email/username are trimmed+lowercased, displayname
 *    is trimmed only (preserving case).
 * 6. Removed redundant `updatedAt: new Date()` — Prisma manages this via @updatedAt.
 * 7. Hidden validation details: Returns simplified error messages, not raw Zod issues.
 * 8. Rate limiting: Enhanced to include email in the key for finer granularity.
 */
router.post("/signup", async (req: Request, res: Response) => {
  // --- Rate limit by IP + email (if provided) for finer granularity ---
  const clientIp = req.ip ?? "unknown";
  const emailHint = typeof req.body?.email === "string"
    ? req.body.email.trim().toLowerCase()
    : "";
  const rateLimitKey = emailHint ? `${clientIp}:${emailHint}` : clientIp;

  if (signupRateLimiter(rateLimitKey)) {
    return res.status(429).json({
      ok: false,
      error: "Too many attempts. Please try again later.",
    });
  }

  // --- Already logged in ---
  if (req.session.userId) {
    return res.status(200).json({
      ok: true,
      message: "Already logged in",
      userId: req.session.userId,
    });
  }

  try {
    // --- Validate input ---
    const parseResult = userZod.signup.safeParse(req.body);

    if (!parseResult.success) {
      // Return simplified validation errors, not raw Zod issues
      const firstIssue = parseResult.error.issues[0];
      const field = firstIssue?.path?.join(".") ?? "body";
      const message = firstIssue?.message ?? "Invalid input";

      return res.status(400).json({
        ok: false,
        error: `${field}: ${message}`,
      });
    }

    // --- Normalize input ---
    // email/username: trim + lowercase (canonical form for uniqueness)
    // displayname: trim only (preserve user's chosen casing)
    const email = parseResult.data.email.trim().toLowerCase();
    const username = parseResult.data.username.trim().toLowerCase();
    const displayname = parseResult.data.displayname.trim();
    const password = parseResult.data.password;

    // --- Hash password (argon2id) ---
    const passwordHash = await hashPassword(password);

    // --- Create user directly (no pre-check) ---
    // P2002 from the DB unique constraint is the authoritative duplicate check.
    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email,
        username,
        displayname,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        displayname: true,
        username: true,
        createdAt: true,
      },
    });

    log.info("User created", { userId: user.id, email, username });

    // --- Regenerate session to prevent session fixation ---
    req.session.regenerate((regenErr) => {
      if (regenErr) {
        log.error("Session regeneration failed", regenErr);
        return res.status(500).json({ ok: false, error: "Server error" });
      }

      req.session.userId = user.id;

      req.session.save((saveErr) => {
        if (saveErr) {
          log.error("Session save failed", saveErr);
          return res.status(500).json({ ok: false, error: "Server error" });
        }

        return res.status(201).json({ ok: true, user });
      });
    });
  } catch (err: unknown) {
    // --- Handle Prisma unique constraint violation ---
    if (isPrismaKnownRequestError(err) && err.code === "P2002") {
      const target = (err.meta?.target as string[]) ?? [];
      const field = target.includes("email") ? "Email" : "Username";

      log.warn("Duplicate signup attempt", { field });

      return res.status(409).json({
        ok: false,
        error: `${field} already exists`,
      });
    }

    // --- Unexpected errors ---
    log.error("Unexpected signup error", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
