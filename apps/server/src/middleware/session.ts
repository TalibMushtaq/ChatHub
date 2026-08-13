import session from "express-session";
import { RedisStore } from "connect-redis";
import { redis } from "../lib/redis";
import csurf from "tiny-csrf";
import type { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Validate required env vars at startup (fail-fast).
// ---------------------------------------------------------------------------

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET environment variable is required. " +
      "Set it to a strong random string (e.g., openssl rand -hex 32).",
  );
}

// Support secret rotation: comma-separated secrets.
// express-session uses the first secret for signing and tries all for
// verification, enabling zero-downtime secret rotation.
const secrets = SESSION_SECRET.split(",")
  .map((s) => s.trim())
  .filter((s): s is string => s.length > 0);

if (secrets.length === 0) {
  throw new Error("SESSION_SECRET must contain at least one non-empty secret");
}

// After validation, secrets is guaranteed non-empty.
const sessionSecrets = secrets as [string, ...string[]];

// tiny-csrf requires a 32-byte secret (AES-256-CBC). Unlike SESSION_SECRET
// (which is comma-separated for rotation), the CSRF secret must be one stable
// value, so it gets its own env var instead of the old zero-padded derivation
// from SESSION_SECRET — padding produced a weak secret whenever SESSION_SECRET
// was short. Exported so index.ts can pass it to cookieParser for
// signed-cookie support.
const CSRF_SECRET = process.env.CSRF_SECRET;
if (!CSRF_SECRET || CSRF_SECRET.length < 32) {
  throw new Error(
    "CSRF_SECRET environment variable is required and must be at least 32 " +
      "characters. Set it to a strong random string (e.g., openssl rand -hex 32).",
  );
}
export const csrfSecret = CSRF_SECRET;

// ---------------------------------------------------------------------------
// Cookie & session defaults
// ---------------------------------------------------------------------------

const COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// ---------------------------------------------------------------------------
// Session middleware
// ---------------------------------------------------------------------------

export const sessionMiddleware = session({
  name: "chathubby.sid",
  store: new RedisStore({
    client: redis,
    // Explicit TTL: align with cookie maxAge so Redis cleans up
    // sessions at the same time the browser expires the cookie.
    ttl: COOKIE_MAX_AGE_MS / 1000,
  }),
  // When an array is provided, the first secret signs new cookies
  // and all secrets are tried for verification — supports rotation.
  secret: sessionSecrets.length > 1 ? sessionSecrets : sessionSecrets[0],
  resave: false,
  // Don't create a session until something is stored in it.
  // Prevents anonymous sessions from consuming Redis memory.
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // In production, cookies are only sent over HTTPS.
    // In development, allow HTTP for local testing.
    secure: process.env.NODE_ENV === "production",
    // "lax" allows cookies on top-level navigations (GET) from external
    // links while blocking cross-site POST requests (CSRF protection).
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
  },
});

// ---------------------------------------------------------------------------
// CSRF protection (via tiny-csrf — recognized by CodeQL's
// js/missing-token-validation rule).
//
// tiny-csrf v1.1.6 validates the `_csrf` field from the request body against
// an encrypted, signed cookie it sets on the response. The frontend must
// fetch GET /api/csrf-token to receive the cookie + token, then echo the
// token back as `_csrf` on every state-changing request.
// ---------------------------------------------------------------------------

export const csrfProtection = csurf(
  csrfSecret,
  ["POST", "PUT", "PATCH", "DELETE"],
  ["/api/csrf-token"], // token endpoint itself is a GET, but list defensively
);

/**
 * Returns the CSRF token for the current request.
 *
 * Intended to be called from a route handler that runs *after*
 * `csrfProtection` has executed (so `req.csrfToken()` is available).
 */
export function getCsrfToken(req: Request, res: Response): string {
  return req.csrfToken();
}
