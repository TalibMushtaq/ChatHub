import { Request, Response } from "express";
import express from "express";
import {
  verifyPassword,
  hashPassword,
  passwordNeedsRehash,
} from "../../lib/password";
import { prisma } from "../../../db/prisma";
import { userZod } from "@repo/validators";
import { createRateLimiter, setRateLimitHeaders } from "../../lib/rateLimiter";
import { createLogger } from "../../lib/logger";

const router = express.Router();
const log = createLogger("login");
const loginRateLimiter = createRateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
});

/**
 * Dummy hash used for constant-time comparison when a user is not found.
 * This prevents timing-based account enumeration: whether the user exists
 * or not, password verification takes approximately the same time.
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/**
 * Unified authentication error response.
 * Every failure returns exactly this — no information leakage about
 * whether the account exists, the password is wrong, or OAuth is required.
 */
const AUTH_ERROR = { ok: false, error: "Invalid credentials" } as const;

/**
 * POST /login
 *
 * Authenticates a user by email or username + password.
 *
 * Security improvements:
 * 1. Session fixation: Regenerates session after successful auth.
 * 2. No information leakage: Same error for all failures (user not found,
 *    wrong password, no password hash, OAuth account).
 * 3. Timing attack resistance: Verifies against a dummy hash when user
 *    is not found, making response time constant regardless of account existence.
 * 4. Rate limiting: Enhanced with email/username in the key.
 * 5. Structured logging: Uses createLogger instead of console.log.
 * 6. Input normalization: email/username are trimmed + lowercased.
 * 7. Minimal data return: Only returns fields the client needs.
 * 8. Proper error typing: Uses `unknown` instead of `any`.
 */
router.post("/login", async (req: Request, res: Response) => {
  // --- Rate limit by IP + identifier ---
  const clientIp = req.ip ?? "unknown";
  const identifier =
    "email" in req.body && typeof req.body.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "username" in req.body && typeof req.body.username === "string"
        ? req.body.username.trim().toLowerCase()
        : "";
  const rateLimitKey = identifier ? `${clientIp}:${identifier}` : clientIp;

  const rl = await loginRateLimiter(rateLimitKey);
  setRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    return res.status(429).json({ ok: false, error: "Too many attempts" });
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
    const parseResult = userZod.login.safeParse(req.body);
    if (!parseResult.success) {
      // Return generic error, not validation details
      return res.status(400).json({
        ok: false,
        error: "Invalid input",
      });
    }

    const data = parseResult.data;
    const password = data.password;

    // --- Normalize and look up user ---
    const email = "email" in data ? data.email.trim().toLowerCase() : undefined;
    const username =
      "username" in data ? data.username.trim().toLowerCase() : undefined;

    const user = await prisma.user.findUnique({
      where: email ? { email } : { username: username! },
      select: {
        id: true,
        email: true,
        username: true,
        displayname: true,
        passwordHash: true,
      },
    });

    // --- Constant-time auth check ---
    // If user not found, verify against dummy hash so response time is
    // the same as a real login attempt (prevents timing enumeration).
    const passwordHash = user?.passwordHash ?? DUMMY_HASH;
    const isValid = await verifyPassword(passwordHash, password);

    if (!user || !isValid || !user.passwordHash) {
      // Log the real reason internally, but never expose it to the client
      if (!user) {
        log.warn("Login failed: user not found", { email, username });
      } else if (!user.passwordHash) {
        log.warn("Login failed: no password hash (OAuth account?)", {
          userId: user.id,
        });
      } else {
        log.warn("Login failed: wrong password", { userId: user.id });
      }

      return res.status(401).json(AUTH_ERROR);
    }

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

        log.info("Login successful", { userId: user.id });

        res.status(200).json({
          ok: true,
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            displayname: user.displayname,
          },
        });

        // Transparently upgrade password hash if parameters have changed.
        // Fire-and-forget: runs after response is sent to avoid latency.
        void (async () => {
          if (
            user.passwordHash &&
            (await passwordNeedsRehash(user.passwordHash))
          ) {
            try {
              const newHash = await hashPassword(password);
              await prisma.user.update({
                where: { id: user.id },
                data: { passwordHash: newHash },
              });
              log.info("Password hash upgraded", { userId: user.id });
            } catch (rehashErr) {
              log.error("Failed to upgrade password hash", rehashErr);
            }
          }
        })();
      });
    });
  } catch (err: unknown) {
    log.error("Unexpected login error", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
